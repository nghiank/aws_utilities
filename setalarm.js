var program = require('commander');
var colors = require('colors');
var async = require('async');
 
program
  .version('0.0.1')
  .option('-d, --debug', 'Add debugging')
  .parse(process.argv);

var all_regions = {
    "prod_na" : {
        "tablename":"matrix-prod.na",
        "region" : "us-east-1"
    },
    "prod_eu" : {
        "tablename":"matrix-prod.eu",
        "region" : "eu-west-1"
    },
    "prod_fe" : {
        "tablename":"matrix-prod.fe",
        "region" : "ap-northeast-1"
    },
    "prod_cn" : {
        "tablename":"matrix-prod.cn",
        "region" : "ap-southeast-1"
    }
};
    
var exec = require('child_process').exec;
var src_region="us-east-1"
var src_name_prefix="Consumed"
var src_profile_name="matrixDynamoDBDevo";
var dst_profile_name="profileprod";

var cmd="aws cloudwatch describe-alarms --alarm-name-prefix " + src_name_prefix + " --region " + src_region + " --profile " + src_profile_name;

console.log("[Executing] ".green + cmd);

exec(cmd, function(error, stdout, stderr) {
    if (error) {
        console.log("[Error] " + error);
        return;
    }
    var data=JSON.parse(stdout);
    out(data);
    var allAlarms = data.MetricAlarms;

    //Generat sns topic
    var topics = {};
    var func = generateTopics(all_regions, topics);
    func.push(generateAlarms(allAlarms, topics));
    async.series(func);
});

function generateAlarms(allAlarms, topics) {
    return function(callback) {
        var done = 0;
        for(var i = 0; i < allAlarms.length; ++i) {
            for (var key in all_regions) {
                var s = all_regions[key];

                out("region=" + s.region);
                out("topics=" + topics[s.region]);
                var newcmd  = buildAlarmCmd(allAlarms[i], s.tablename, s.region, topics[s.region]);

                (function(newcmd) {
                    exec(newcmd, function(error, stdout, stderr) {
                        if (error) {
                            console.log("[error]".red + error);
                            console.log("[error]".red + newcmd);
                            return;
                        }
                        console.log("[success]".green + newcmd);
                        done++;
                        if (done == all_regions.length * allAlarms.length - 1) 
                        {
                            callback(null, "done!");
                        }
                    });
                })(newcmd);
            }
        }
    };
}


function buildAlarmCmd(alarm, tablename, region, topic) {
    process.env.AWS_DEFAULT_REGION=region; 
    var a = alarm;
    var source="";
    for (var j = 0; j < a.Dimensions.length; ++j) {
        var k = a.Dimensions[j];
        source += "Name=" + k.Name;
        source += ",Value=" + tablename;
        source += " ";
    }

    var c = "aws cloudwatch put-metric-alarm"
    c += " ";
    c += "--alarm-name " + a.AlarmName ;
    c += " ";
    c += "--alarm-description \"" + a.AlarmDescription + "\"" ;
    c += " ";
    if (a.ActionsEnabled) {
        c += "--actions-enabled";
    } else {
        c += "--actions-disabled";
    }
    c += " ";
    c += "--alarm-actions " + topic; 
    c += " ";
    c += "--metric-name " + a.MetricName;
    c += " ";
    c += "--namespace " + a.Namespace;
    c += " ";
    c += "--period " + a.Period;
    c += " ";
    c += "--evaluation-periods " + a.EvaluationPeriods;
    c += " ";
    c += "--dimensions " + source ;
    c += " ";
    c += "--threshold " + a.Threshold;
    c += " ";
    c += "--comparison-operator " + a.ComparisonOperator;
    c += " ";
    c += "--statistic " + a.Statistic;
    c += " ";
    c += "--profile " + dst_profile_name;
    return c;
}

function generateTopics(all_regions, topics) {
    var func = [];
    for(var key in all_regions) {
        var s = all_regions[key];
        var reg = s.region;
        var foo = (function(region){
            return function(callback) {
                var generateTopicCmd = "aws sns create-topic --name MatrixService_Topic --profile " + dst_profile_name;
                out(generateTopicCmd);
                process.env.AWS_DEFAULT_REGION=region; 
                exec(generateTopicCmd, function(err, stdout, stderr) {
                    if (err) {
                        console.log("Error in creating topics " + err);
                        callback("Error", "not ok");
                        return;
                    }
                    var arn = JSON.parse(stdout);
                    topics[region] = arn.TopicArn;
                    console.log("[" + region.green + "]New topic was created:".green + topics[region]);
                    callback(null, "ok");    
                });
            }
        } )(reg);
        func.push( foo );        
    }
    return func;
}

function out(st) {
    if (program.debug) {
        console.log(st);
    }
}


