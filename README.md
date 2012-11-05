jwebquery
=========

jQuery like web crawler
# Note
It's my first node modules and features are not well tested now.Since it's just a crawler,use it on your own risk.

# Feature
* gzip support 
* http/https support
* cookie support
* can set page fetch/download interval,and max parallel download limitations.
* http proxy support
* GET method support ,POST is not tested and upload multipart is not supported
* auto add http head Referer

# Example

## basic
```javascript
var jwebquery = require("jwebquery");
(new jwebquery.Page("http://www.stackoverflow.com/")).ready(function(page){
    //get things by css selector
    //we get every summery text of index page of stackoverflow
    page.find(".question-summary .summary h3").each(function(index){
	//access jquery from jwebquery 
	console.log(index,jwebquery.$(this).text());
    })
}).on("error",function(err){
    console.log(err);
})


```
## proxy
```javascript
//use localhost:8099 as http proxy
jwebquery.setProxy("http://localhost:8099/");
```