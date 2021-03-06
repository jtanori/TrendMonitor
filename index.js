'use strict';

require('newrelic');

var express = require('express');
var session = require('express-session');
var _ = require('lodash');
var s = require("underscore.string");
var bodyParser = require('body-parser');
var compression = require('compression');
var multer = require('multer');
var ejs = require('ejs-locals');
var MobileDetect = require('mobile-detect');
var helmet = require('helmet');
var CryptoJS = require('cryptojs');
var http = require('https');
var events = require("events");
var Parse = require('parse').Parse;
var Trends = require('./Trends');
var Promise = require('promise');
var mailgun = require('mailgun-js')({apiKey: process.env.MAILGUN_API_KEY, domain: process.env.MAILGUN_DOMAIN});
var memjs = require('memjs');
var Promise = require('promise');
var mc = memjs.Client.create(process.env.MEMCACHEDCLOUD_SERVERS, {
  username: process.env.MEMCACHEDCLOUD_USERNAME,
  password: process.env.MEMCACHEDCLOUD_PASSWORD
});
var TwitterAggregator = require('./TwitterAggregator');
var Autolinker = require( 'autolinker' );
var ig = require('instagram-node').instagram();
var https = require('https');

//Initialize Parse
Parse.initialize(process.env.PARSE_APP_ID, process.env.PARSE_JS_KEY, process.env.PARSE_MASTER_KEY);

//===============EXPRESS================
// Configure Express
var app = express();
app.set('port', (process.env.PORT || 4000));
app.use(session({
    secret: process.env.SESSION_SECRET,
    rolling: true,
    saveUninitialized: true,
    resave: false
}));
app.engine('ejs', ejs);
app.set('views', __dirname + '/views'); // Specify the folder to find templates
app.set('view engine', 'ejs'); // Set the template engine
app.use(compression());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(multer());
app.use(express.static(__dirname + '/public'));
app.use(express.static(__dirname + '/semantic/dist'));
app.use(helmet());
//Enable cors
app.use(function(req, res, next) {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers', 'X-Requested-With');
        next();
    })
    .options('*', function(req, res, next) {
        res.end();
    });

app.locals._ = _;
app.locals.PARSE_APP_ID = process.env.PARSE_APP_ID;
app.locals.PARSE_JS_KEY = process.env.PARSE_JS_KEY;
app.locals.GA_ACCOUNT = '';
app.locals.LAYOUT = '';

//===============ROUTES===============
var title = process.env.DEFAULT_PAGE_TITLE;
var logRequest = function(req, res, next) {
    console.log('%s %s %s', req.method, req.url, req.path);
    next();
};

var getDeviceExtension = function(ua) {
    var md = new MobileDetect(ua);

    return md.phone() ? 'phones' : md.tablet() ? 'tablets' : '';
};

var checkEnvironment = function(req, res, next) {
    console.log('check environment');
    console.log(req.hostname);
    // Since the session check is performed in all routes we can
    // also configure the layout
    var device = getDeviceExtension(req.headers['user-agent']);
    switch (device) {
        case 'phones':
            app.locals.LAYOUT = 'phones';
            break;
        case 'tablets':
            app.locals.LAYOUT = 'tablets';
            break;
        default:
            app.locals.LAYOUT = 'main';
            break;
    }

    next();
};

var auth = function(req, res, next) {
    var auth;

    // check whether an autorization header was send    
    if (req.headers.authorization) {
      // only accepting basic auth, so:
      // * cut the starting "Basic " from the header
      // * decode the base64 encoded username:password
      // * split the string at the colon
      // -> should result in an array
      auth = new Buffer(req.headers.authorization.substring(6), 'base64').toString().split(':');
    }

    // checks if:
    // * auth array exists 
    // * first value matches the expected user 
    // * second value the expected password
    if (!auth || auth[0] !== 'admin' || auth[1] !== 'admin') {
        // any of the tests failed
        // send an Basic Auth request (HTTP Code: 401 Unauthorized)
        res.statusCode = 401;
        // User can be changed to anything, will be prompted to the user
        res.setHeader('WWW-Authenticate', 'Basic realm="User"');
        // this will displayed in the browser when authorization is cancelled
        res.end('Unauthorized');
    } else {
        // continue with processing, user was authenticated
        next();
    }
}

//Main router
var Monitor = express.Router();

Monitor.use(logRequest);

Monitor.post('/', function(req, res) {
    //Check attrs
    var Region = Parse.Object.extend('Region');
    var query = new Parse.Query(Region);

    var Trend = Parse.Object.extend('Trend');
    var trendQuery = new Parse.Query(Trend);

    var Email = Parse.Object.extend('Email');
    var emailQuery = new Parse.Query(Email);

    var template = _.template('<h1>This is what we\'ve found:</h1><br /><br /><table><thead><%= head %></thead><tbody><%= body %></tbody></table>');
    var TrendsHistory = Parse.Object.extend('History');
    var trendHistoryQuery = new Parse.Query(TrendsHistory);

    var regions, trends, trendHistory, users = [], findings = [], trendsHistory = [];

    query
        .exists('name')
        .find()
        .then(function(r){
            if(r.length){
                regions = r;
                return trendQuery.equalTo('active', true).find();
            }else{
                return Parse.Promise.error('No regions found');
            }
        })
        .then(function(t){
            if(t.length){
                trends = t.map(function(t){return t.get('name').toLowerCase();});

                return emailQuery.exists('address').find();
            }else{
                return Parse.Promise.error('No trends found in database');
            }
        })
        .then(function(u){
            if(u.length){
                users = u.map(function(u){return u.get('address')});

                return regions.map(function(r){
                    var woeid = r.get('woeid');
                    
                    return Trends.get(woeid); 
                });
            }else{
                return Parse.Promise.error('No users found');
            }
        })
        .then(function(requests){
            Promise
                .all(requests)
                .then(function(results){
                    //Cache trends
                    results = _.map(results, function(r){
                        return {name: r.locations[0].name, trends: _.map(r.trends, function(r){return r.name.toLowerCase()})};
                    });

                    console.log(results, 'results');
                    console.log(trends, 'keywords');

                    _.each(results, function(r){
                        var intersection = _.intersection(r.trends, trends) || [];
                        var subIntersections = [];

                        _.each(r.trends, function(t){
                            _.each(trends, function(tr){
                                if(t.indexOf(tr) >= 0) {
                                    subIntersections.push(t);
                                    trendsHistory.push(t);
                                }
                            });
                        });

                        _.each(intersection, function(t){
                            trendsHistory.push(t);
                        });

                        if(intersection.length){
                            findings.push('<tr><td>' + r.name + '</td><td><strong dir="auto">' + intersection.join('</strong> <strong>') + '</strong></td></tr>');
                        }

                        if(subIntersections.length){
                            findings.push('<tr><td>' + r.name + '</td><td><strong dir="auto">' + subIntersections.join('</strong> <strong>') + '</strong></td></tr>');
                        }
                    });

                    if(findings.length){
                        trendsHistory = _.uniq(trendsHistory);

                        trendHistoryQuery
                            .containedIn('trends', trendsHistory)
                            .find()
                            .then(function(savedTrends){
                                if(!savedTrends.length){
                                    trendHistory = new TrendsHistory({trends: trendsHistory});
                                    trendHistory.save();

                                    _.each(users, function(u){
                                        var data = {
                                            from: 'Naif Ali <naif@naif.cc>',
                                            to: u,
                                            subject: 'New alert on twitter monitor',
                                            html: template({head: '<tr><th>Region</th><th>Keywords</th></tr>', body: findings.join("\n")})
                                        };

                                        mailgun.messages().send(data);
                                    });

                                    res.status(200).json({status: 'success', data: trendsHistory});
                                }else{
                                    res.status(200).json({status: 'success', message: 'trend unchanged'});
                                }
                            })
                            .fail(function(e){
                                console.log('fail', e);
                                res.status(200).json({status: 'success', message: 'nothing to report'});
                            });
                    }else{
                        //Drop history records if no findings
                        trendHistoryQuery
                            .find()
                            .then(function(r){
                                if(r.length){
                                    Parse.Object
                                        .destroyAll(r)
                                        .then(function(){
                                            res.status(200).json({status: 'success', message: 'Database wiped'});
                                        })
                                        .fail(function(){
                                            res.status(200).json({status: 'error', error: e});
                                        })
                                }else{
                                    res.status(200).json({status: 'success', message: 'Nothing to delete'});
                                }
                            })
                            .fail(function(e){
                                res.status(200).json({status: 'error', error: e});
                            });
                        
                    }
                }, function(e){
                    res.status(400).json({status: 'error', error: e});
                });
        })
        .fail(function(e){
            res.status(400).json({status: 'error', error: e});
        });

});

//Use CashRegister router
app.use('/monitor', Monitor);

//Simple admin router
var MonitorAdmin = express.Router();

MonitorAdmin.use(logRequest);

MonitorAdmin.get('/', auth, function(req, res){
    var keywords = [];
    var Trend = Parse.Object.extend('Trend');
    var trendQuery = new Parse.Query(Trend);

    trendQuery
        .equalTo('active', true)
        .find()
        .then(function(trends){
            keywords = trends.map(function(t){
                return {name: t.get('name'), active: t.get('active'), id: t.id};
            });
            
            res.render('admin', {
                data: {
                    title: 'TTM',
                    keywords: keywords,
                    page: 'monitor'
                }
            });
        })
        .fail(function(){
            res.render('admin', {
                data: {
                    title: 'TTM',
                    keywords: keywords,
                    page: 'monitor'
                }
            });
        });
});

app.use('/admin', MonitorAdmin);

// -------------------------------------
//Aggregator

//Store queries
var queries = {};

function getConfig(hostname){
    var config = JSON.parse(process.env.ALLOWED_DOMAINS);
    var key = _.find(config.domains, function(d){return d.name === hostname;});

    if(key && process.env[key.configKey]){
        return JSON.parse(process.env[key.configKey]);
    }else{
        return JSON.parse(process.env.TWITTER_DEFAULT_KEYS);
    }
}

function getInstagramData(userId, accessToken){
    var body = '';

    return new Promise(function(resolve, reject){
        https.get('https://api.instagram.com/v1/users/' + userId + '/?access_token=' + accessToken, function(res) {
            res.on('data', function(d) {
                console.log('DATA', d);
                body += d;
            });

            res.on('end', function(){
                try{
                    resolve(JSON.parse(body));
                }catch(e){
                    reject(e);
                }
                
            });

        }).on('error', function(e) {
            reject(e);
        });
    });    
}

var getPicture = function(req, res){
    var keys = req.agg.config
    var config = {
        consumer_key: keys.consumer_key,
        consumer_secret: keys.consumer_secret,
        access_token_key: keys.consumer_token_key,
        access_token_secret: keys.consumer_token_secret
    };
    var aggregator = new TwitterAggregator();
    var instagramData;

    app.locals.GA_ACCOUNT = keys.ga_account;

    //Get twitts for this instance
    aggregator
        .client(config)
        .getTweet({id: req.params.id})
        .then(function(t, response){

            if(t && t.entities.media && t.entities.media.length){
                t = {
                    id: t.id_str, 
                    text: t.text.replace(/(?:https?|ftp):\/\/\S+/g, ''), 
                    urlText: t.text.replace(/(?:https?|ftp):\/\/\S+/g, ''),
                    entities: t.entities,
                    retweet_count: t.retweet_count,
                    number: req.params.number || false
                };

                res.render('aggregator/picture', {
                    data: {
                        tweet: t, 
                        title: t.text  + ' - ' + keys.name,
                        description: keys.page_description,
                        logo: keys.logo.url,
                        host: req.hostname
                    }
                });
            }else{
                res.render('aggregator/error', {
                    data: {title: 'error', error: 'Not a picture tweet'}
                });
            } 
        }, function(e){
            res.render('aggregator/error', {
                data: {title: 'error', error: e}
            });
        });
};

var fetchConfig = function(req, res, next){
    var AGGConfig = Parse.Object.extend('AGG_config');
    var query;

    if(!queries[req.hostname]){
        query = queries[req.hostname] = new Parse.Query(AGGConfig);
    }else{
        query = queries[req.hostname];
    }

    //Save request config
    req.agg = {config: undefined, error: undefined};

    query
        .containedIn('domains', [req.hostname])
        .first()
        .then(function(d){
            req.agg.config = d.toJSON();
            next();
        }, function(e){
            console.log('CONFIG NOT FOUND FOR AGGREGATOR');
            console.log(e);
            res.redirect(404, '/not-found');
        });
};

var Aggregator = express.Router();

Aggregator.use(logRequest);
Aggregator.use(checkEnvironment);

Aggregator.get('/', fetchConfig, function(req, res){
    var isAjax = req.xhr;
    var keys = req.agg.config;
    var fromIndex = req.query.index*1 || 0;
    var config = {
        consumer_key: keys.consumer_key,
        consumer_secret: keys.consumer_secret,
        access_token_key: keys.consumer_token_key,
        access_token_secret: keys.consumer_token_secret
    };
    var aggregator = new TwitterAggregator();
    var options = {
        screen_name: keys.account,
        exclude_replies: true, 
        include_rts: false,
        count: 5
    };
    var instagramData = {};

    if(req.query.from){
        options.max_id = req.query.from;
        options.count = options.count + 1;//This because twitter will include the max_id twit and we may don't need that
    }

    app.locals.GA_ACCOUNT = keys.ga_account;

    //Get twitts for this instance
    aggregator
        .client(config)
        .getTimeline(options)
        .then(function(tweets, response){
            //Parse results
            var results = tweets.filter(function(r){
                if(r.entities && r.entities.media && r.entities.media.length){
                    return r;
                }
            }).map(function(t){
                if(!fromIndex){
                    fromIndex = t.user.statuses_count;
                }

                return {
                    id: t.id_str,
                    //text: Autolinker.link(t.text, {twitter: true, newWindow: true, className: 'link'}), 
                    text: t.text.replace(/(?:https?|ftp):\/\/\S+/g, ''),
                    urlText: t.text.replace(/(?:https?|ftp):\/\/\S+/g, ''),
                    entities: t.entities,
                    retweet_count: t.retweet_count,
                    index: fromIndex--
                };
            });

            var ids = results.map(function(r){return r.id;});
            var Photo = Parse.Object.extend('AGG_photo');
            var photoQuery = new Parse.Query(Photo);

            photoQuery
                .containedIn('twtt_id', ids)
                .find(function(objs){
                    if(!objs.length){
                        objs = ids.map(function(id){
                            var index = _.find(results, function(r){if(id === r.id){return true;}});
                            if(index){
                                return new Photo({twtt_id: id, index: index.index})
                            }
                        });
                    }else{
                        ids.forEach(function(id){
                            var index = _.find(results, function(r){
                                if(r.id === id){return r;}
                            });
                            var exists = _.find(objs, function(r){
                                if(r.get('twtt_id') === index.id){return r;}
                            });

                            if(exists){
                                exists.set({index: index.index});
                            }else{
                                objs.push(new Photo({twtt_id: id, index: index.index}));
                            }
                        });
                    }

                    //Save new objects and update existing ones in case the number has changed
                    Parse.Object
                        .saveAll(objs)
                        .then(sendResponse, sendResponse);
                }, function(e){
                    var objs = ids.map(function(id){
                        var index = _.find(results, function(r){if(id === r.id){return true;}});
                        if(index){
                            return new Photo({twtt_id: id, index: index.index})
                        }
                    });
                    //Save all objects in case of error
                    Parse.Object
                        .saveAll(objs)
                        .then(sendResponse, sendResponse);
                });

            var render = function(){
                res.render('aggregator/main', {
                    data: {
                        title: keys.page_title,
                        description: keys.page_description,
                        results: results,
                        logo: keys.logo.url,
                        content: tweets,
                        user: tweets[0].user,
                        instagram: _.extend({}, instagramData, {username: keys.instagram_user}),
                        host: req.hostname
                    }
                });
            }
            var sendResponse = function(){

                if(isAjax){
                    res.status(200).json({results: results, status: 'success'});
                }else if(keys.instagram_user_id && keys.instagram_access_token){
                    //Get instagram data
                    getInstagramData(keys.instagram_user_id, keys.instagram_access_token)
                        .then(function(data){
                            instagramData = data;
                            render();
                        }, render);
                }else{
                    render();
                }
            }
        }, function(e){
            if(isAjax){
                res.status(400).json(e);
            }else{
                res.render('aggregator/error', {
                    data: {title: 'error', error: e}
                });
            }
        });
});

Aggregator.get('/picture/:id/:text', fetchConfig, getPicture);
Aggregator.get('/picture/:id/:text/:number', fetchConfig, getPicture);
Aggregator.get('/p/:id', fetchConfig, function(req, res){
    var Photo = Parse.Object.extend('AGG_photo');
    var query = new Parse.Query(Photo);
    var keys = req.agg.config
    var config = {
        consumer_key: keys.consumer_key,
        consumer_secret: keys.consumer_secret,
        access_token_key: keys.consumer_token_key,
        access_token_secret: keys.consumer_token_secret
    };
    var aggregator = new TwitterAggregator();
    var instagramData;

    app.locals.GA_ACCOUNT = keys.ga_account;

    query
        .equalTo('index', req.params.id*1)
        .first(function(p){
            if(p){
                //Get twitts for this instance
                aggregator
                    .client(config)
                    .getTweet({id: p.get('twtt_id')})
                    .then(function(t, response){

                        if(t && t.entities.media && t.entities.media.length){
                            t = {
                                id: t.id_str, 
                                text: t.text.replace(/(?:https?|ftp):\/\/\S+/g, ''), 
                                urlText: t.text.replace(/(?:https?|ftp):\/\/\S+/g, ''),
                                entities: t.entities,
                                retweet_count: t.retweet_count,
                                index: p.get('index')
                            };

                            res.render('aggregator/picture', {
                                data: {
                                    tweet: t, 
                                    title: t.text  + ' - ' + keys.name,
                                    description: keys.page_description,
                                    logo: keys.logo.url,
                                    host: req.hostname
                                }
                            });
                        }else{
                            console.log('NOT FOUND');
                            res.redirect(404, '/not-found');
                        } 
                    }, function(e){
                        console.log('NOT FOUND');
                        console.log(e);
                        res.redirect(404, '/not-found');
                    });
            }else{
                console.log('NOT FOUND');
                console.log(p);
                res.redirect(404, '/not-found');
            }
        }, function(e){
            console.log('NOT FOUND');
            console.log(e);
            res.redirect(404, '/not-found');
        })
});

Aggregator.get('/about', fetchConfig, function(req, res){
    var config = req.agg.config;

    app.locals.GA_ACCOUNT = config.ga_account;

    res.render('aggregator/about', {
        data: {
            title: 'About',
            logo: config.logo.url,
            text: config.about
        }
    });
});

app.use('/', Aggregator);

var AggregatorAdmin = express.Router();

AggregatorAdmin.get('/', function(req, res){
    var AGGConfig = Parse.Object.extend('AGG_config');
    var query = new Parse.Query(AGGConfig);

    query
        .find()
        .then(function(a){
            res.render('admin/aggregator', {
                data: {
                    title: 'Aggregator Admin',
                    clients: a,
                    page: 'aggregator'
                }
            });
        }, function(e){
            res.render('admin/aggregator-error', {
                data: {
                    title: 'Aggregator Admin',
                    error: e
                }
            });
        });
});

app.use('/admin/aggregator', AggregatorAdmin);

app.use('/not-found', function(req, res){
    res.render('aggregator/error', {
        data: {title: 'Not found', error: 'Looks like the page you are looking for does not longer exists, please try navigating to the home page'}
    });
})
//Default route, blank
app.get('*', function(req, res){
    res.send(':p');
});

/*===============START=================*/
app.listen(app.get('port'), function() {
    console.log("Node app is running at localhost:" + app.get('port'));
});