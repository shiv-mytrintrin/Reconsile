
var ReconsileService = require('./reconsile-service');

//setInterval(function () {
setTimeout(function () {
    // console.log('Timeout');
    ReconsileService.reconcile(function (err,result) {
        if(err)
        {
            console.error('Error reconcilation '+err);
            //return;
        }

    });
},30000);