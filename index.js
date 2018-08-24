const extract = require('extract-zip'),
    tmp = require('tmp'),
    fs = require('fs'),
    path = require('path'),
    request = require('request'),
    AWS = require('aws-sdk');

const s3bucket = 'know-god-assets';
const s3 = new AWS.S3({ signatureVersion: 'v4' });

const mobileContentAPI = 'https://mobile-content-api.cru.org';

const Batch = require('batch'), batch = new Batch;
batch.concurrency(2);

exports.handler = (event, context, callback) => {
  let zipFilename = event.Records[0].s3.object.key.split('/').pop();
  console.log('Zip file: ' + zipFilename);
  zipFilename = zipFilename.substring(8);
  let versionId = zipFilename.substring(0, zipFilename.length - 4);
  console.log('Version id: ' + versionId);

  //get translations index
  request(mobileContentAPI + '/translations', (error, response, body) => {
    let translations = JSON.parse(body);
    translations = translations.data;

    //get translations ids from version ids
    translations = translations.filter(translation => {
      return translation.attributes.version === Number(versionId);
    });

    translations.forEach(translation => {
      batch.push((done) => {
        //download translation
        let tmpZip = tmp.fileSync();
        request(mobileContentAPI + '/translations/' + translation.id)
            .pipe(fs.createWriteStream(tmpZip.name))
            .on('error', (err) => {
              console.log(translation.id + ' zip download error', err);
            })
            .on('close', () => {
              console.log(translation.id + ' zip file download complete.');

              let tmpExtractDir = tmp.dirSync({unsafeCleanup: true});
              extract(tmpZip.name, {dir: tmpExtractDir.name}, (err) => {
                if(err){
                  console.log(translation.id, err);
                  done();
                  return;
                }

                fs.readdir(tmpExtractDir.name, (err, files) => {
                  console.log('Zip file extracted.');
                  if (!files || files.length === 0) {
                    console.log(`provided folder '${tmpExtractDir.name}' is empty or does not exist.`);
                    console.log('Make sure your project was compiled!');
                    done();
                    return;
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
                      Key: path.join(translation.id, fileName),
                      Body: fileContent,
                      ACL: 'public-read'
                    }).promise());
                  }

                  Promise.all(uploadPromises).then(() => {
                    console.log(translation.id + ' Complete.');
                    done();
                  });

                });
              });
            });
      });

      batch.end(() => {
        console.log('Complete.');
        callback();
      });

    });
  });
};