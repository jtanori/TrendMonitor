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
var parseString = require('xml2js').parseString;
var parse = require('xml2json');
var events = require("events");
var Parse = require('parse').Parse;
var Trends = require('./Trends');
var Promise = require('promise');
var mailgun = require('mailgun-js')({apiKey: process.env.MAILGUN_API_KEY, domain: process.env.MAILGUN_DOMAIN});
var memjs = require('memjs');
var mc = memjs.Client.create(process.env.MEMCACHEDCLOUD_SERVERS, {
  username: process.env.MEMCACHEDCLOUD_USERNAME,
  password: process.env.MEMCACHEDCLOUD_PASSWORD
});

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
    // Since the session check is performed in all routes we can
    // also configure the layout
    var device = getDeviceExtension(req.headers['user-agent']);
    switch (device) {
        case 'phones':
            app.locals.LAYOUT = LAYOUT = 'phones';
            break;
        case 'tablets':
            app.locals.LAYOUT = LAYOUT = 'tablets';
            break;
        default:
            app.locals.LAYOUT = LAYOUT = 'main';
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
                    keywords: keywords
                }
            });
        })
        .fail(function(){
            res.render('admin', {
                data: {
                    title: 'TTM',
                    keywords: keywords
                }
            });
        });
});

app.use('/admin', MonitorAdmin);

//Default route, blank
app.get('/', function(req, res){
    res.send(':p');
});

/*===============START=================*/
app.listen(app.get('port'), function() {
    console.log("Node app is running at localhost:" + app.get('port'));
});