

# metalsmith-git

gets previous versions of files from git and makes them available to metalsmith


```js
var git = require('metalsmith-git')

Metalsmith()
.use(git({repo:'..', pattern:'posts/*.md'}))
.use(..)
```
## Options

You can pass the following options to metalsmith-git

 - repo: path to the git repository realtive to metalsmith root folder, default: '.'
 - pattern: search for prevous versions of files matching the given patterns (relative to metalsmith source folder)

The position of metalsmith-git in the plugin pipeline allows to you to define which plugins take previous file versions into account.

Most propably you want to put metalsmith-git before any templating/rendering plugins but after plugins like metalsmith-tags or metalsmith-collections
which group posts togehter.
 
