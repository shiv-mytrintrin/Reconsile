/**
 * Created by root on 7/5/17.
 */
var async = require('async'),
    moment = require('moment');
var eMemberships = require('./eMemberPlans');
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

exports.reconcile = function (callback) {
    var checkinDetails;
    var today = moment();
    today= today.format('YYYY-MM-DD');
    async.series([
        function (callback) {

            MongoClient.connect(dbUrl, function(err, db) {
                assert.equal(null, err);
                var collection = db.collection('checkin');
                collection.find({'status':'Close','errorStatus':0,'localUpdate':0,checkInTime:{$gte:new Date(today)}}).sort({'checkInTime':1}).toArray(function(err, result) {
                    if(err)
                    {
                        db.close();
                        return callback(err,null);
                    }
                    if(!result)
                    {
                        db.close();
                        return callback(null,"No checkouts found");
                    }
                    db.close();
                    checkinDetails = result;
                    return callback(null,result);
                });
            });

            /*            checkin.find({'status':'Close','errorStatus':0,'localUpdate':0,checkInTime:{$gte:moment(today)}}).sort({'checkInTime': 'ascending'}).exec(function (err,result) {
             if(err)
             {
             return callback(err,null);
             }
             checkinDetails = result;
             return callback(null,result);
             });*/
        },
        function (callback) {
            if(checkinDetails.length>0)
            {
                async.forEach(checkinDetails,function (checkinDetail,callback2) {

                    checkoutprocess(checkinDetail,function (err,result) {
                        if(err)
                        {
                            return callback2(err,null);
                        }
                        return callback2(null,result);
                    });
                },function (err,result) {
                    if(err)
                    {
                        console.error('Error at foreach '+ err);
                    }
                });
                return callback(null,null);
            }
            else
            {
                return callback(null,null);
            }
        }
    ],function (err,result) {
        if(err)
        {
            return callback(err,null);
        }
        return callback(null,result);
    });
};

function checkoutprocess(checkindetails,callback) {
    var checkout;
    var userDet;
    var update = false;
    var checkoutdetails;
    var today = moment();
    today= today.format('YYYY-MM-DD');
    async.series([
        function(callback)
        {
            MongoClient.connect(dbUrl, function(err, db) {
                assert.equal(null, err);
                var collection = db.collection('checkout');
                collection.find({vehicleId:Number(checkindetails.vehicleId),'status':'Close','errorStatus':0,'localUpdate':0,checkOutTime: {$gte:new Date(today),$lt:new Date(checkindetails.checkInTime)}}).sort({'checkOutTime':-1}).toArray(function(err, result) {
                    if(err)
                    {
                        db.close();
                        return callback(err,null);
                    }
                    if(result.length==0)
                    {
                        db.close();
                        return callback(new Error("NO matching checkout found"),null);
                    }
                    db.close();
                    checkoutdetails = result[0];
                    return callback(null,result);
                });
            });
        },
        function (callback) {

            MongoClient.connect(dbUrl, function(err, db) {
                assert.equal(null, err);
                //console.log("Connected correctly to server");
                var collection = db.collection('users');
                //var o_id = new ObjectID(id);
                collection.findOne({UserID:Number(checkoutdetails.user)},function(err, result) {
                    if(err)
                    {
                        db.close();
                        return callback(err,null);
                    }
                    if(!result)
                    {
                        db.close();
                        return callback(new Error("User not found please sync"),null);
                    }
                    userDet = result;
                    return callback(null,result);
                });
            });
        },
        function (callback) {
            if(userDet._type=='member')
            {
                if(userDet.membershipId)
                {
                    MongoClient.connect(dbUrl, function(err, db) {
                        assert.equal(null, err);
                        //console.log("Connected correctly to server");
                        var collection = db.collection('membership');
                        var o_id = new ObjectID(userDet.membershipId);
                        collection.findOne({_id:o_id},function(err, membership) {
                            if(err)
                            {
                                db.close();
                                return callback(err,null);
                            }
                            if(!membership)
                            {
                                db.close();
                                return callback(new Error("User not found please sync"),null);
                            }
                            for (var i = 0; i < eMemberships.length; i++) {
                                if (membership.userFees == eMemberships[i].userFees) {
                                    var checkInTime = moment(checkindetails.checkInTime);
                                    var checkOutTime = moment(checkoutdetails.checkOutTime);

                                    var durationMin = moment.duration(checkInTime.diff(checkOutTime));
                                    var duration = durationMin.asMinutes();
                                    var fee = 250;
                                    for (var j = 0; j < eMemberships[i].plans.length; j++) {
                                        if (duration <= eMemberships[i].plans[j].endTime) {
                                            fee = eMemberships[i].plans[j].fee;
                                            var balance = Number(userDet.creditBalance)-fee;
                                            userDet.creditBalance = balance;
                                            var Usercollection = db.collection('users');
                                            var USER_id = new ObjectID(userDet._id);
                                            Usercollection.update({_id:USER_id},{$set:{creditBalance: balance,vehicleId:[]}},function(err, updatedUser) {
                                                if(err)
                                                {
                                                    db.close();
                                                    return callback(null,null);
                                                }
                                                db.close();
                                                console.log(userDet.creditBalance+' : Updated balance of card number '+userDet.cardNum);
                                                update = true;
                                                return callback(null,updatedUser);
                                            });
                                            break;
                                        }
                                    }
                                }
                            }
                        });
                    });
                }
                else
                {
                    return callback(null,null);
                }
            }
            else
            {
                return callback(null,null);
            }
        },
        function (callback) {
            if(userDet._type!='member')
            {
                if (userDet.vehicleId.length > 0) {
                    for (var i = 0; i < userDet.vehicleId.length; i++) {
                        if (userDet.vehicleId[i].vehicleUid==checkoutdetails.vehicleId) {
                            userDet.vehicleId.splice(i, 1);
                        }
                    }
                }
                else
                {
                    userDet.vehicleId = [];
                }
                MongoClient.connect(dbUrl, function(err, db) {
                    assert.equal(null, err);
                    var Usercollection = db.collection('users');
                    var USER_id = new ObjectID(userDet._id);
                    Usercollection.update({_id:USER_id},{$set:{vehicleId:userDet.vehicleId}},function(err, updatedUser) {
                        if(err)
                        {
                            db.close();
                            return callback(null,null);
                        }
                        if(!updatedUser)
                        {
                            db.close();
                            return callback(null,null);
                        }
                        db.close();
                        console.log('Employee updated');
                        update = true;
                        return callback(null,updatedUser);
                    });
                });
            }
            else
            {
                return callback(null,null);
            }
        },
        function (callback) {
            if(update)
            {
                MongoClient.connect(dbUrl, function(err, db) {
                    assert.equal(null, err);
                    var collection = db.collection('checkout');
                    var o_id = new ObjectID(checkoutdetails._id);
                    collection.update({_id:o_id},{$set:{localUpdate:1}},function(err, result) {
                        if(err)
                        {
                            db.close();
                            return callback(null,null);
                        }
                        db.close();
                        return callback(null,result);
                    });
                });
            }
            else
            {
                return callback(null,null);
            }

        },
        function (callback) {
            if(update)
            {
                MongoClient.connect(dbUrl, function(err, db) {
                    assert.equal(null, err);
                    var collection = db.collection('checkin');
                    var o_id = new ObjectID(checkoutdetails._id);
                    collection.update({_id:o_id},{$set:{localUpdate:1}},function(err, result) {
                        if(err)
                        {
                            db.close();
                            return callback(null,null);
                        }
                        db.close();
                        return callback(null,result);
                    });
                });
            }
            else
            {
                return callback(null,null);
            }
        }
    ],function (err,result) {
        if(err)
        {
            return callback(err,null);
        }
        return callback(null,result);
    });

}

