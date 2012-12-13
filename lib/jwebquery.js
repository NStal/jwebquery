var jWebQuery = exports;
var zlib = require("zlib");
var jQuery = require("jquery");
var url = require("url");
var path = require("path");
var request = require("request");
var http = require("http");
var https = require("https");
var spawn = require("child_process").spawn;
var fs = require("fs");
var EventEmitter = require("events").EventEmitter;
var _console = console;
jWebQuery.interval = 0;
jWebQuery.max = 5;
var SmartBuffer = function(defaultSize){
    this.size = defaultSize || 1024*4;
    this.buffer = new Buffer(this.size);
    this.offset = 0;
    this.validSize = 0;
}
SmartBuffer.prototype.append = function(content,encodeOrLength){
    if(typeof content == "string"){
	//console.log("CONTENT",content);
	var byteLength = Buffer.byteLength(content,encodeOrLength|| "utf8");
	if(this.offset+byteLength>this.size){
	    this.realloc();
	    this.append(content,encodeOrLength);
	    return;
	}else{
	    this.buffer.write(content,this.offset,byteLength);
	    this.validSize += Buffer.byteLength(content,encodeOrLength);
	    this.offset = this.validSize;
	    return;
	}
    }
    if(Buffer.isBuffer(content)){
	if(this.offset+(encodeOrLength||content.length)>=this.size){
	    this.realloc();
	    this.append(content,encodeOrLength);
	    return;
	}
	content.copy(this.buffer,this.offset,0,encodeOrLength || content.length);
	this.validSize += encodeOrLength || content.length;
	this.offset = this.validSize;
	return;
    }
}
SmartBuffer.prototype.realloc = function(){
    var newSize = this.size*2;
    var newBuffer = new Buffer(newSize);
    this.buffer.copy(newBuffer,0,0);
    this.buffer = null;
    this.buffer = newBuffer;
    this.size = newSize;
    return this;
}
SmartBuffer.prototype.clear = function(){
    this.offset = 0;
    this.validSize = 0;
}
SmartBuffer.prototype.getFixedBuffer = function(){
    var buffer = new Buffer(this.validSize);
    this.buffer.copy(buffer,0,0,this.validSize);
    return buffer;
} 
exports.SmartBuffer = SmartBuffer;
var getProtocol = function(url){
    if(url.indexOf("https")==0)return https;
    if(url.indexOf("http")==0)return http;
    return null;
}
var proxy;
jQuery.fn.follow = function(){
    var pages = [];
    var object = this;
    this.each(function(index){
	var href = jQuery(this).attr("href");
	if(!href)return;
	if(object.page){
	    var target = url.resolve(object.page.url,href); 
	}else{
	    var target = href;
	}
	pages.push(Page.create(target,{page:object.page}));
    });
    return pages;
}
jQuery.fn.downloadSrc = function(dir){
    var downloads = [];
    var object = this;
    var dir = dir || "./";
    var page = this.page || {};
    this.each(function(index){
	var src = jQuery(this).attr("src");
	if(!src)return;
	if(object.page){
	    var target = url.resolve(object.page.url,src); 
	}else{
	    var target = src;
	}
	downloads.push(Download.createAndStart(target,dir,{page:page}));
    });
    return downloads;
}
var Download = function(url,dir,option){
    EventEmitter.call(this);
    this.url = url;
    this.dir = dir || "./";
    var option = option || {};
    if(option.name && option.keepExtension){
	option.name+=path.extname(url);
    }
    this.name = option.name || path.basename(url);
    var option = option || {};
    this.page = option.page || {};
    this.jar = this.page.jar || option.jar || false;
    this.referer = this.page.url || "";
    this.method = option.method || "GET";
    this.retry = 0;
}
Download.createAndStart = function(url,dir,option){
    var _ = new Download(url,dir,option);
    this.queue.push(_);
    this.next();
    return _;
}
Download.lastActionTime = 0;
Download.skipExist = true;
Download.autoRetry = 1;
Download.next = function(){
    if(this.queue.length<0){
	return;
    }
    var now = Date.now();
    if(now - this.lastActionTime < Download.interval){
	var self = this; 
	//console.log("too fast wait interval",this.interval);
	if(!self.trigger){
	    self.trigger = setTimeout(function(){
		self.trigger = null;
		self.next();
	    },this.interval-now+this.lastActionTime);
	}
	return;
    }
    if(this.current<this.max){
	this.lastActionTime = Date.now();
	var download = this.queue.shift();
	download.start(true);
	this.current++;
	download.on("complete",function(){
	    Download.current--;
	    Download.next();
	})
	download.on("error",function(){
	    Download.current--;
	    Download.next();
	})
	this.next();
    }
}
Download.queue = [];
Download.max = 2;
Download.current = 0;
Download.prototype = new EventEmitter();
Download.prototype.start = function(overwrite){
    var self = this;
    console.log("start",this.url);
    if(Download.skipExist && !overwrite){
	var exist = fs.existsSync(path.join(this.dir,this.name));
	if(exist){
	//console.log("file"
	//	       ,path.join(this.dir,this.name)
	//	       ,"exists");
	    this.emit("complete",path.join(this.dir,this.name));
	    return;
	}
    }    
    //console.log("download",this.url,"to",path.join(this.dir,this.name));
    var emitError = false;
    //console.log("send request downloads");
    var req = request({
	method:this.method
	,jar:this.jar
	,uri:this.url
	,headers:{"Referer":this.referer}
	,proxy:proxy
    },function(err,rsp,body){
	if(err || rsp.statusCode!=200){
	    if(err){
		if(!emitError){
		    self.emit("error",err); 
		    emitError = true;
		}
		//already emit on("error") event
		return;
	    }
	    console.error("recieve",rsp.statusCode);
	    console.error("fail to downlaod",self.url);
	    self.emit("error",{error:"response not 200"
			       ,statusCode:rsp.statusCode
			      });
	}
    });
    //console.log({
    //	method:this.method
    //	,jar:this.jar
    //	,uri:this.url
    //	,headers:{"Referer":this.referer}
    //});
    req.pipe(fs.createWriteStream(path.join(this.dir,this.name)
				  ,{flags:"w"}));
    req.on("error",function(err){
	if(!emitError){
	    self.emit("error",err);
	    emitError = true;
	}
	//console.error("fail to download!",err);
    })
    req.on("end",function(){
	self.emit("complete",path.join(self.dir,self.name));
    })
    return this;
}

var Defer = function(){
    this._queue = [];
    this.idle = true;
}
Defer.prototype = new EventEmitter;
Defer.prototype.next = function(){
    this.idle = true;
    this.defer();
}
Defer.prototype.defer = function(object){
    if(object){
	this._queue.push(object);
	if(this.idle)this.defer();
	return;
    }
    if(this.idle && this._queue.length>0){
	var object = this._queue.shift();
	this.idle = false;
	object.act.call(this,this);
	return;
    }
}
var Page = function(url,option){
    Defer.call(this);
    this.url = url; 
    var option = option || {}
    this.parent = option && option.page;
    this.jar = option && (option.page && option.page.jar
			  || option.jar) ||request.jar();
    this.headers = option.headers|| {};
    this.method = option && option.method || "GET";
    this.form = option && option.form || undefined;
    if(!option || !option.delay){
	this.init();
    }
    var self = this;
    if(option && typeof option.delay == "number"){
	setTimeout(function(){
	    self.init();
	},option.delay);
    }
}
Page.prototype = new Defer();
//too many request will cause query be blocked
Page.queue = [];
Page.max = 2;
Page.currentDownload = 0;
Page.create = function(url,option){
    if(!option){
	option = {}
    }
    option.delay = true;
    return Page.delay(new Page(url,option));
}
Page.delay = function(page){
    var self = this; 
    Page.queue.push(page);
    //console.log("current %d,max %d",Page.currentDownload,Page.max)
    if(Page.currentDownload<Page.max){
	Page.next();
    }
    return page;
}
Page.lastActionTime = 0;
Page.next = function(){
    if(this.currentDownload>=this.max){
	return;
    }
    var now = Date.now(); 
    var self = this;
    if(now - this.lastActionTime < this.interval){
	var self = this; 
	//console.log("too fast wait interval",this.interval);
	if(!self.trigger){
	    self.trigger = setTimeout(function(){
		self.trigger = null;
		self.next();
	    },this.interval-now+this.lastActionTime);
	}
	return;
    }
    if(this.queue.length>0){
	this.lastActionTime = Date.now();
	var page = this.queue.shift();
	page.ready(function(){
	    self.currentDownload--;
	    self.next();
	    //console.log("end page download");
	})
	//console.log("start page download");
	page.init();
	this.currentDownload++;
	this.next();
    }
}
Page.prototype.init = function(){
    var self = this;
    this.defer({act:function(){self.update()}});
    return this;
}
Page.prototype.update = function(){
    //console.error("new page");
    //console.error(this.url);
    var self = this;
    this.html = null;
    this.nodeJ = null;
    this.isReady =false;
    var requestInfo = {
	uri:this.url
	,jar:this.jar
	,method:this.method 
	,proxy:proxy
    }
    if(this.parent){
	requestInfo.headers = this.headers;
	requestInfo.headers["Referer"] = this.parent.url;
    }
    if(this.method == "POST" && this.form){
	requestInfo.form = this.form;
    }
    var smartBuffer = new SmartBuffer();
    var emitError = false;
    var uncompress = {
	"gzip":zlib.gunzip
	,"deflate":zlib.deflate
    }
    //console.log("send request",requestInfo);
    request(requestInfo,function(err,resp,body){
	if(err && !emitError){
	    self.emit("error",err);
	    emitError = true;
	    return;
	}
	var fixedBuffer =smartBuffer.getFixedBuffer();
	var uncomp = uncompress[resp.headers["content-encoding"]];
	if(uncomp){
	    uncomp(fixedBuffer,function(err,nb){
		self.html = nb.toString();
		self.isReady = true;
		self.emit("ready");
		self.next();
	    })
	}else{
	    self.html = body || "";
	    self.next();
	    self.isReady = true;	
	    self.emit("ready");
	}
    }
    ).on("error",function(err){
	if(!emitError){
	    self.emit("error",err);
	    emitError = true;
	}
    }).on("data",function(data){
	smartBuffer.append(data);
    }).on("end",function(){
    });
}
Page.prototype.post = function(uri,form){
    var target = url.resolve(this.url,uri);
    return Page.create(target,{method:"POST",page:this,form:form});
}
Page.prototype.get = function(uri){
    var target = url.resolve(this.url,uri);
    return Page.create(target,{method:"GET",page:this});
}

Page.prototype.find = function(selector){
    if(typeof this.html!="string"){
	return null;
    }
    if(!this.nodeJ)this.nodeJ=jQuery(this.html);
    var _ =  this.nodeJ.find(selector);
    _.page = this;
    return _;
}
Page.prototype.download = function(uri,dir,option){
    
    var target = url.resolve(this.url,uri);
    var option = option || {};
    option.page = this;
    return Download.createAndStart(target,dir,option);
    
}
Page.prototype.ready = function(callback){
    var self = this;
    if(self.isReady){
	callback(self);
	return;
    }
    this.on("ready",function(){
	callback(self);
    })
    return this;
}

jWebQuery.Page = Page;
jWebQuery.Defer = Defer;
jWebQuery.Download = Download;
jWebQuery.setProxy = function(_proxy){
    proxy = _proxy;
    //request = request.defaults({
    //	proxy:proxy
    //})
}
jWebQuery.setInterval = function(interval){
    this.interval = interval; 
    Page.interval = interval;
    Download.interval = interval;
}
jWebQuery.setMax = function(max){
    this.max = max;
    Page.max = max;
    Download.max = max;
}
jWebQuery.$ = jQuery;
jWebQuery.verbose = function(){
    console = _console
}
jWebQuery.silence = function(){
    console = {
	log:function(){}
    }
}
jWebQuery.verbose();
