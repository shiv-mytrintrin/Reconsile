/**
 * Created by root on 25/7/17.
 */
/**
 * Created by root on 27/10/16.
 */
var async = require('async');

var MongoClient = require('mongodb').MongoClient,
    ObjectID = require('mongodb').ObjectID,
    assert = require('assert');
var config = require('config');
var host = config.get('db.host'),
    port = config.get('db.port'),
    username = config.get('db.username'),
    password = config.get('db.password'),
    database = config.get('db.database'),

    dbUrl = 'mongodb://' + host + ':' + port + '/' + database;

var mPlans=[];
var memberPlans=[];

async.series([
    function (callback) {
        MongoClient.connect(dbUrl, function(err, db) {
            assert.equal(null, err);
            //console.log("Connected correctly to server");
            var collection = db.collection('membership');
            //var o_id = new ObjectID(id);
            collection.findOne({},function(err, m) {
                if(err)
                {
                    db.close();
                    return callback(err,null);
                }
                if(!m)
                {
                    db.close();
                    return callback(new Error("Error getting Membership Plans"),null);
                }
                var FarePlancollection = db.collection('fare-plan');
                var o_id = new ObjectID(m.farePlan);
                FarePlancollection.findOne({_id:o_id},function(err, result) {
                    if(err)
                    {
                        db.close();
                        return callback(err,null);
                    }
                    if(!result)
                    {
                        db.close();
                        return callback(new Error("Error getting Fare Plans"),null);
                    }
                    m.farePlan = result;
                    mPlans.push(m);
                    return callback(null,result);
                });
            });
        });
    },
    function (callback) {
        for(var i=0;i<mPlans.length;i++)
        {
            var data = mPlans[i];
            var planDetails={
                // subscriptionType:data.subscriptionType,
                validity:data.validity,
                userFees:data.userFees,
                plans:data.farePlan.plans
            };
            memberPlans.push(planDetails);
        }
        return callback(null,memberPlans);
    }

],function (err,result) {
    if(err) {
        console.log('Error in getting MemberShip Plans');
    }
    //console.log(JSON.stringify(memberPlans));
    console.log('Plans Fetched successfully');
});

module.exports=memberPlans;