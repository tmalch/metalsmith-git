"use strict"

var debug = require('debug')('metalsmith-git');
var multimatch = require('multimatch');
var Git = require("nodegit");
var path = require("path");
var matter = require('gray-matter');
var Mode = require('stat-mode');
var utf8 = require('is-utf8');
var fs = require('fs');


module.exports = plugin;

const flatten = arr => arr.reduce(
  (acc, val) => acc.concat(
    Array.isArray(val) ? flatten(val) : val
  ),
  []
);

function plugin(opts){
  opts.pattern = opts.pattern || [];
  opts.layout = opts.layout || null;  // if given this overrides the layout from the file
  
  var repo;
  return function (files, metalsmith, done){
    opts.repo = opts.repo || metalsmith.directory();

    let prefix = path.relative(opts.repo, metalsmith.source());
    let repo_path = path.join(opts.repo, ".git")
    Git.Repository.open(repo_path)
    .then(function(r) {
      repo = r  // initialize repo
      debug("opened repo %s, %s", repo.path(), repo.workdir());
      return repo.getMasterCommit();
    }).then(function(firstCommitOnMaster){
      let filtered_files = Object.keys(files)
                    .filter(f => multimatch(f, opts.pattern).length)
      let seq = Promise.resolve()
      filtered_files.forEach(function(file){
        let gitfilepath = path.join(prefix, file);
        seq = seq.then(() => getVersionsOf(gitfilepath, firstCommitOnMaster))
        .then(flatten)
        .then(function(versions){
              debug("%s has %s versions	", file, versions.length);
              let parsed = versions.reverse()
                    .map((version, version_nr)  => parseVersion(version, version_nr))

              let newest = parsed[parsed.length-1];
              parsed = parsed.slice(0, parsed.length-1)
              files[file].version = newest.version;
              files[file].commit = newest.commit;
              files[file].versions = parsed;

              parsed.forEach(function(parsed){
                if(opts.layout){
                  parsed.layout = opts.layout;
                }
                let version_name = file+"_versions/v"+parsed.version+".md";
                files[version_name] = parsed;
              })
        })
      })
      return seq;
    }).then(function(){
        done();
     }).catch(function(e){
        debug("metalsmith-git had an error:");
        debug(e);
        done();
     });
  }


  /**
  * returns a all versions of given file `gitfilepath` from `from_commit` on backwards.
  *
  * @param {String} path to file relative to git repository
  * @param {Commit} starting commit
  * @return {Promise} possibly nested list of objects with commit and blob attribute
  */
  function getVersionsOf(gitfilepath, from_commit){
    let walker = repo.createRevWalk();
    walker.push(from_commit.sha());
    walker.sorting(Git.Revwalk.SORT.Time);
    
    return walker.fileHistoryWalk(gitfilepath, 1000).then(function(history){
          let versions = []
          history.forEach(function(history_entry){
             //history_entry.status: 4=rename, 1=add, 3=edited
             if(history_entry.status == 4 && history_entry.oldName == gitfilepath){ 
                return // for this commit only the file newName exists 
             }
             let version = getBlobOf(gitfilepath, history_entry.commit)
                .then(function(blob, idx){
                  return {commit: history_entry.commit, blob:blob}
                });
             versions.push(version); 
             if(history_entry.status == 4 && history_entry.newName == gitfilepath){
                debug("renamed %s to %s", history_entry.oldName, history_entry.newName)
                versions.push(getVersionsOf(history_entry.oldName, history_entry.commit));
             }
          })
         return Promise.all(versions);
    });
  }
  
  /**
  * get the content of `file_path` at `commit`
  *
  * @param {String} path to file relative to git repository
  * @param {Commit}
  * @return {Promise} to Buffer object of file content
  */
  function getBlobOf(file_path, commit){
    return repo.getTree(commit.treeId())
          .then(function(tree){
            return tree.getEntry(file_path);
          })
          .then(function(tree_entry){
            return tree_entry.getBlob();
          }).catch(e => debug("error getting %s at %s: $s",file_path,commit, e))
  }
  /**
  * convert a version object as returned by `getVersionsOf` into a file object that can be injected into metalsmith
  */
  function parseVersion(version, version_nr){
      let data = parseContent(version.blob)
      data.commit = {
            id: version.commit.id().toString(),
            message: version.commit.message(),
            author: version.commit.author().name(),
            date: version.commit.date()
      }
      data.version = version_nr;
      return data
  }
  
  /**
  * parse a blob like metalsmith would parse a file
  */
  function parseContent(blob){
    let frontmatter = true;//metalsmith.frontmatter();
    let parsed;
    let ret = {};
    let buffer = blob.content()
    let sha = blob.id().toString()
    let blob_file = path.join(repo.path(), "objects", sha.slice(0, 2), sha.slice(2))
    
    if (frontmatter && utf8(buffer)) {
      try {
        parsed = matter(buffer.toString());
      } catch (e) {
        debug(e);
        var err = new Error('Invalid frontmatter in the file at: ' + file);
        err.code = 'invalid_frontmatter';
        throw err;
      }
      ret = parsed.data;
      ret.contents = new Buffer(parsed.content);
    } else {
      ret.contents = buffer;
    }
    
    ret.stats = fs.statSync(blob_file)
    ret.mode = Mode(ret.stats).toOctal();
    return ret
  }
}



