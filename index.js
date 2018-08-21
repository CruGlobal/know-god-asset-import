const extract = require('extract-zip'),
    tmp = require('tmp'),
    fs = require('fs'),
    path = require('path'),
    request = require('request'),
    AWS = require('aws-sdk');

const s3bucket = 'know-god-assets';
const s3 = new AWS.S3({ signatureVersion: 'v4' });

const mobileContentAPI = 'https://mobile-content-api.cru.org';

exports.handler = async (event) => {

  let zipFilename = event.Records[0].s3.object.key.split('/').pop();
  zipFilename = zipFilename.substring(8);
  let translationId = zipFilename.substring(0, zipFilename.length - 4);

  //download translation
  let tmpZip = tmp.fileSync();
  request(mobileContentAPI + '/translations/' + translationId)
      .pipe(fs.createWriteStream(tmpZip.name))
      .on('close', () => {
        let tmpExtractDir = tmp.dirSync({unsafeCleanup: true});
        extract(tmpZip.name, {dir: tmpExtractDir.name}, function (err) {
          if(err){
            console.log(translationId, err);
            return;
          }

          fs.readdir(tmpExtractDir.name, (err, files) => {
            if (!files || files.length === 0) {
              console.log(`provided folder '${tmpExtractDir.name}' is empty or does not exist.`);
              console.log('Make sure your project was compiled!');
              process.exit();
            }

            //only xml
            files = files.filter(file => file.includes('.xml'));

            let uploadPromises = [];
            for (const fileName of files) {
              // get the full path of the file
              const filePath = path.join(tmpExtractDir.name, fileName);

              // ignore if directory
              if (fs.lstatSync(filePath).isDirectory()) {
                continue;
              }

              const fileContent = fs.readFileSync(filePath);

              // upload file to S3
              uploadPromises.push(s3.putObject({
                Bucket: s3bucket,
                Key: path.join(translationId, fileName),
                Body: fileContent,
                ACL: 'public-read'
              }).promise());
            }

            Promise.all(uploadPromises).then(() => {
              console.log('Complete.');
            });

          });
        });
      });
};