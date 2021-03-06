/**
* GetAmazonLinuxImageId: A Lambda function that looks up the latest Amazon Linux AMI ID
* for a given OS Variant and Region (HVM64 only).
**/

var osNameToPattern = {
  'Amazon Linux'           : 'amzn-ami-hvm-????.??.?.????????-x86_64-gp2',
  'Amazon Linux 2017.03.0' : 'amzn-ami-hvm-2017.03.0.????????-x86_64-gp2',
  'Amazon Linux 2016.09.1' : 'amzn-ami-hvm-2016.09.1.????????-x86_64-gp2',
  'Amazon Linux 2016.09.0' : 'amzn-ami-hvm-2016.09.0.????????-x86_64-gp2'
};

exports.handler = function(event, context) {
  console.log('Request body:\\n' + JSON.stringify(event));

  if (event.RequestType == 'Delete') {
    sendResponse(event, context, 'SUCCESS');
    return;
  }

  var responseStatus = 'FAILED';
  var responseData = {};

  var osBaseName = osNameToPattern[event.ResourceProperties.OSName];
  if (osBaseName === undefined) {
    osBaseName = 'amzn-ami-hvm-????.??.?.????????-x86_64-gp2';
  }
  console.log('OS: ' + event.ResourceProperties.OSName + ' -> ' + osBaseName);

  var aws = require('aws-sdk');

  var ec2 = new aws.EC2({region: event.ResourceProperties.Region});
  var describeImagesParams = {
    Filters: [{ Name: 'name', Values: [osBaseName]}],
    Owners: ['amazon']
  };

  console.log('Calling DescribeImages...');
  ec2.describeImages(describeImagesParams, function(err, describeImagesResult) {
    if (err) {
      responseData = {Error: 'DescribeImages call failed'};
      console.error(responseData.Error + ':\\n', err);
    }
    else {
      var images = describeImagesResult.Images;
      console.log('DescribeImages returned ' + images.length + ' images');
      images.sort(function(x, y) { return y.Name.localeCompare(x.Name); });
      for (var i = 0; i < images.length; i++) {
        responseStatus = 'SUCCESS';
        responseData['ImageId'] = images[i].ImageId;
        responseData['Name'] = images[i].Name;
        console.log('Found: ' + images[i].Name + ', ' + images[i].ImageId);
        break;
      }
    }

    sendResponse(event, context, responseStatus, responseData);
  });
};

function sendResponse(event, context, responseStatus, responseData) {
  var responseBody = JSON.stringify({
    Status: responseStatus,
    Reason: 'See the details in CloudWatch Log Stream: ' + context.logStreamName,
    PhysicalResourceId: context.logStreamName,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: responseData
  });

  console.log('Response body:\n', responseBody);

  var https = require('https');
  var url = require('url');

  var parsedUrl = url.parse(event.ResponseURL);
  var options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: parsedUrl.path,
    method: 'PUT',
    headers: {
      'content-type': '',
      'content-length': responseBody.length
    }
  };

  var request = https.request(options, function(response) {
    console.log('Status code: ' + response.statusCode);
    console.log('Status message: ' + response.statusMessage);
    context.done();
  });

  request.on('error', function(error) {
    console.log('send(..) failed executing https.request(..): ' + error);
    context.done();
  });

  request.write(responseBody);
  request.end();
}
