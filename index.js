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
      let versioned_files = filtered_files.map(function(file){
              let gitfilepath = path.join(prefix, file);
              return getVersionsOf(gitfilepath, firstCommitOnMaster)
                  .then(function(versions){
                      debug("%s has %s versions	", file, versions.length);
                      
                      files[file].versions = [];
                      versions.reverse().map(function(version, version_nr){
                        let data = parseContent(version.blob)
                        data.commit = {
                              id: version.commit.id().toString(),
                              message: version.commit.message(),
                              author: version.commit.author().name(),
                              date: version.commit.date()
                        }
                        data.version = version_nr;
                        return data
                      })
                      .forEach(function(data){
                        if(data.version == versions.length-1){ //newest version
                          files[file].version = data.version;
                          files[file].commit = data.commit;
                          return
                        }
                        if(opts.layout){
                          data.layout = opts.layout;
                        }
                        let version_name = file+"_versions/v"+data.version
                        files[version_name] = data;
                        files[file].versions.push(data);
                      })
                  })
          }
      );
      return Promise.all(versioned_files)
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
  * @return {Promise} list of Buffer objects
  */
  function getVersionsOf(gitfilepath, from_commit){
    let walker = repo.createRevWalk();
    walker.push(from_commit.sha());
    walker.sorting(Git.Revwalk.SORT.Time);
    return walker.fileHistoryWalk(gitfilepath, 1000).then(function(history){
          debug("history length of %s: %s ", gitfilepath, history.length)
          return Promise.all(
            history.map(function(history_entry){
              return getBlobOf(gitfilepath, history_entry.commit).then(function(blob, idx){
                return {commit: history_entry.commit, blob:blob}
              });
            })
          );
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
          })
          .then(function(blob){
            return blob;
          })
  }
  
  /**
  * parse blob like metalsmith would parse a file
  * 
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



