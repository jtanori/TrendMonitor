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
var wwwhisper = require('connect-wwwhisper');

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

    var findings = [];
    var requests = [];

    query
        .exists('name')
        .find()
        .then(function(regions){
            if(regions.length){
                trendQuery
                    .equalTo('active', true)
                    .find()
                    .then(function(trends){
                        if(trends.length){
                            emailQuery
                                .exists('address')
                                .find()
                                .then(function(users){
                                    if(users.length){
                                        requests = regions.map(function(r){
                                            var woeid = r.get('woeid');
                                            
                                            return Trends.get(woeid); 
                                        });

                                        Promise
                                            .all(requests)
                                            .then(function(results){
                                                console.log(results, 'results');

                                                res.status(200).json({status: 'success', data: results});
                                            }, function(e){
                                                res.status(400).json({status: 'error', error: e});
                                            });
                                    }else{
                                        res.status(400).json({status: 'error', error: {essage: 'No users found'}});
                                    }
                                })
                                .fail(function(e){
                                    res.status(400).json({status: 'error', error: e});
                                });
                        }else{
                            res.status(400).json({status: 'error', error: {message: 'No trends found'}});
                        }
                    })
                    .fail(function(e){
                        res.status(400).json({status: 'error', error: e});
                    });
            }else{
                res.status(400).json({status: 'error', error: {message: 'No regions found'}});
            }
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