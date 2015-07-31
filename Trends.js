var _ = require('lodash');
var OAuth = require('oauth');
var Promise = require('promise');
var TWITTER_ACCOUNT_SWITH = 1;

function getTrends(region){
	if(!region || _.isEmpty(region)){
		throw new Error('Trend.get requires a region');
	}

	var a,b,c,d;

	switch(TWITTER_ACCOUNT_SWITH){
	case 1:
		TWITTER_ACCOUNT_SWITH++;
		a = process.env.TWITTER_CONSUMER_KEY;
		b = process.env.TWITTER_CONSUMER_SECRET;
		c = process.env.TWITTER_ACCESS_TOKEN;
		d = process.env.TWITTER_ACCESS_TOKEN_SECRET;
		break;
	case 2:
		TWITTER_ACCOUNT_SWITH++;
		a = process.env.TWITTER_CONSUMER_KEY_2;
		b = process.env.TWITTER_CONSUMER_SECRET_2;
		c = process.env.TWITTER_ACCESS_TOKEN_2;
		d = process.env.TWITTER_ACCESS_TOKEN_SECRET_2;
		break;
	case 3:
		TWITTER_ACCOUNT_SWITH = 1;
		a = process.env.TWITTER_CONSUMER_KEY_3;
		b = process.env.TWITTER_CONSUMER_SECRET_3;
		c = process.env.TWITTER_ACCESS_TOKEN_3;
		d = process.env.TWITTER_ACCESS_TOKEN_SECRET_3;
		break;
	}
	
	var oauth = new OAuth.OAuth(
		'https://api.twitter.com/oauth/request_token',
		'https://api.twitter.com/oauth/access_token',
		a,
		b,
		'1.0A',
		null,
		'HMAC-SHA1'
	);

	var promise = new Promise(function(resolve, reject){
		oauth.get(
			'https://api.twitter.com/1.1/trends/place.json?id=' + region,
			c,
			d,
			function (e, data, res){
				if(!_.isNull(e)){
					console.log('rejected', e, data, region);
					reject(e);
				}else{
					data = JSON.parse(data);
					console.log('resolved');
					resolve(data[0]);
				}    
			}
		);
	});

	return promise;
};

module.exports = {
	get: getTrends
};