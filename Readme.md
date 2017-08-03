

# metalsmith-git

gets previous versions of files/pages from git and makes them available to metalsmith


```js
var git = require('metalsmith-git')

Metalsmith()
.use(git({repo:'<rel_path_to_repo>', pattern:'posts/*.md'}))
.use(..)
```

Each file matched by `pattern` gets augmented with the following metadata: 
 * version: the version number which is also the number of previous versions
 * versions: list of previous versions as js objects, newest to oldest
 * commit: object that describes the last commit

All previous versions of the file are also transformed to javascript objects. 
Just like they were in the filesystem and the metalsmith core would load them. 
So the content, parsed frontmatter, stats and so on are available for 
further processing by the following plugins in the pipeline.
They are named according to the schema: <filepath>_versions/v<version>.md. 

For example given the file `path_to/testpost.md`:
```
   ---
   title: A Catchy Title
   draft: false
   ---

   An unfinished article...
```
with history: 
```shell
$ git log --oneline
5738102 change title of testpost
2ae62d9 add content to testpost
.....
b7751be add file testpost.md
```
metalsmith-git will generate:
```js
'path_to/testpost.md': {
    title: 'A Catchy Title',
    draft: false,
    contents: 'An unfinished article...',
    mode: '0664',
    stats: {...}
    version: 3,
    commit: { id: '5738102cd04d0923ec959a861013f64dc16e0843',
              message: 'change title of testpost',
              author: 'Thomas Malcher',
              date: Tue May 23 2017 09:22:32 (CEST) 
    },
    versions: [ { title: "A Boring Title", 
                  version: 2, 
                  commit: {...}
                  stats: {}
                  contents: 'An unfinished article...',
                  ....
                 }, 
                { title: "put a cool title here", 
                  version: 1, 
                  commit: {...}
                  stats: {}
                  contents: 'TODO',
                  ....
                 }, ....
              ],
 },
'path_to/testpost.md_versions/v2.md': { 
    title: "A Boring Title", 
    version: 2, 
    commit: {...}
    stats: {}
    contents: 'An unfinished article...',
    ....
}, 
'path_to/testpost.md_versions/v1.md': { 
    title: "put a cool title here", 
    version: 1, 
    ....
}, 
```

## Options

You can pass the following options to metalsmith-git

 - repo: path to the git repository realtive to metalsmith root folder, default: '.'
 - pattern: search for prevous versions of files matching the given patterns (relative to metalsmith source folder)

The position of metalsmith-git in the plugin pipeline allows to you to define which plugins take previous file versions into account.

Most propably you want to put metalsmith-git before any templating/rendering plugins but after plugins like metalsmith-tags or metalsmith-collections
which group posts togehter.
 
