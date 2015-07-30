var worker = require('node_helper');
var https = require("https");
var http = require("http");
var events = require("events");
var params = worker.params;

var Monitor = (function () {
    var eventEmitter = new events.EventEmitter();

    return {
        EventEmitter:eventEmitter  // The event broadcaster
    };
})();

Monitor.EventEmitter.once("result", function (results) {
	console.log('Results');
    console.log(results);
});

function monitor(){
    console.log('Monitor task initiated');

    var data = JSON.stringify({foo: 'bar'});
	var request = http.request({
        host:"twittertrendmonitor.herokuapp.com",
        method: "POST",
        path:"/monitor",
        headers: {
	    	'Content-Type': "application/json",
            'Content-Length': data.length
	    },
    })
        .on("response", function (response) {
            var body = "";

            response.on("data", function (data) {
                body += data;
                try {
                    var res = JSON.parse(body);
                    console.log('response');
                    console.log(res);
                    Monitor.EventEmitter.emit("result", res);
                    Monitor.EventEmitter.removeAllListeners("result");
                }
                catch (ex) {
                    console.log("Loading...");
                    console.log(ex);
                }
            });
        });

    request.write(data);
    request.end();
};

monitor();