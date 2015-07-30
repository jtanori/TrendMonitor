var _ = require('lodash');
var OAuth = require('oauth');
var Promise = require('promise');

var OAuth2 = OAuth.OAuth2;
var oauth2 = new OAuth2(
	process.env.TWITTER_CONSUMER_KEY,
	process.env.TWITTER_CONSUMER_SECRET, 
	'https://api.twitter.com/', 
	null,
	'oauth2/token', 
	null
);

function getTrends(region){
	if(!region || _.isEmpty(region)){
		throw new Error('findTrend requires a region');
	}

	var promise = new Promise(function(resolve, reject){
		oauth2.getOAuthAccessToken(
			'',
			{'grant_type':'client_credentials'},
			function (e, access_token, refresh_token, results){
				console.log(e, access_token, refresh_token, results);
				if(!_.isNull(e)){
					reject(e);
				}else{
					oauth2.get('https://api.twitter.com/1.1/trends/place.json?' + region, access_token, function(){
						resolve(Array.prototype.slice.call(arguments));
					});
				}
			});
	});

	return promise;
};

module.exports = {
	get: getTrends
};