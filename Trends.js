var _ = require('lodash');
var OAuth = require('oauth');
var Promise = require('promise');

function getTrends(region){
	if(!region || _.isEmpty(region)){
		throw new Error('findTrend requires a region');
	}

	var OAuth2 = OAuth.OAuth2;    
	var twitterConsumerKey = 'your key';
	var twitterConsumerSecret = 'your secret';
	var oauth2 = new OAuth2(
		server.config.keys.twitter.consumerKey,
		twitterConsumerSecret, 
		'https://api.twitter.com/', 
		null,
		'oauth2/token', 
		null
	);

	var promise = new Promise(function(resolve, reject){
		oauth2.getOAuthAccessToken(
			'',
			{'grant_type':'client_credentials'},
			function (e, access_token, refresh_token, results){
				if(!_.isNull(e)){
					promise.reject(e);
				}else{
					promise.resolve(auth2.get('https://api.twitter.com/1.1/trends/place.json?' + region));
				}
			});
	});

	return promise;
};

module.exports = {
	get: getTrends
};