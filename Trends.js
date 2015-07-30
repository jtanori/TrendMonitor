var _ = require('lodash');
var OAuth = require('oauth');
var Promise = require('promise');
var oauth = new OAuth.OAuth(
	'https://api.twitter.com/oauth/request_token',
	'https://api.twitter.com/oauth/access_token',
	process.env.TWITTER_CONSUMER_KEY,
	process.env.TWITTER_CONSUMER_SECRET,
	'1.0A',
	null,
	'HMAC-SHA1'
);

function getTrends(region){
	if(!region || _.isEmpty(region)){
		throw new Error('Trend.get requires a region');
	}

	var promise = new Promise(function(resolve, reject){
		oauth.get(
			'https://api.twitter.com/1.1/trends/place.json?id=' + region,
			process.env.TWITTER_USER_TOKEN,
			process.env.TWITTER_USER_SECRET,
			function (e, data, res){
				console.log(data, 'data');
				if(!_.isNull(e)){
					reject(e);
				}else{
					resolve(data);
				}    
			}
		);
	});

	return promise;
};

module.exports = {
	get: getTrends
};