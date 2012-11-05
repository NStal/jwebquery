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

