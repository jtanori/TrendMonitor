var Twitter = require('twitter');
var Promise = require('promise');

//Create factory
function TwitterAggregator(){};

TwitterAggregator.prototype.client = function(options){
	this._client = new Twitter(options);

	return this;
};

TwitterAggregator.prototype.getTimeline = function(options){
	if(!this._client){
		throw new Error('TwitterAggregator requires a Twitter client.');
	}

	var client = this._client;
	
	return new Promise(function(resolve, reject){
		client.get('statuses/user_timeline', options || {}, function(err, tweets, response){
			if(err){
				reject(err);
			}else{
				resolve(tweets, response);
			}
		});
	});
};

TwitterAggregator.prototype.getTweet = function(id){
	if(!this._client){
		throw new Error('TwitterAggregator requires a Twitter client.');
	}

	if(!id){
		throw new Error('TwitterAggregator.getTweet required a valid id.');
	}

	var client = this._client;

	return new Promise(function(resolve, reject){
		client.get('statuses/show/', id, function(err, tweet, response){
			if(err){
				reject(err);
			}else{
				resolve(tweet, response);
			}
		});
	});
};

module.exports = TwitterAggregator;