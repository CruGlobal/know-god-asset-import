const extract = require('extract-zip'),
    tmp = require('tmp'),
    fs = require('fs'),
    path = require('path'),
    request = require('request'),
    AWS = require('aws-sdk');

const s3bucket = 'know-god-assets';
const s3 = new AWS.S3({ signatureVersion: 'v4' });

const mobileContentAPI = 'https://mobile-content-api.cru.org';

exports.handler = (event, context, callback) => {
  const pathParts = event.Records[0].s3.object.key.split('/');
  let resource = pathParts[1], language = pathParts[2], zipFilename = pathParts[3];

  console.log('Resource: ' + resource);
  console.log('Language: ' + language);
  console.log('Zip file: ' + zipFilename);
  zipFilename = zipFilename.substring(8);
  let versionId = zipFilename.substring(0, zipFilename.length - 4);
  console.log('Version id: ' + versionId);

  //get translations index
  request(mobileContentAPI + '/translations?include=resource,language', (error, response, body) => {
    const jsonResponse = JSON.parse(body);

    //find language and resource id
    language = jsonResponse.included.find(record => {
      return record.type === 'language' && record.attributes.code === language;
    });
    resource = jsonResponse.included.find(record => {
      return record.type === 'resource' && record.attributes.abbreviation === resource;
    });

    //find translations id
    let translation = jsonResponse.data.find(translation => {
      return translation.relationships.resource.data.id === resource.id &&
          translation.relationships.language.data.id === language.id &&
          translation.attributes.version === Number(versionId);
    });

    if(!translation){
      console.log('Translation not found.');
      callback();
      return;
    }

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
            callback();
            return;
          }

          fs.readdir(tmpExtractDir.name, (err, files) => {
            console.log('Zip file extracted.');
            if (!files || files.length === 0) {
              console.log(`provided folder '${tmpExtractDir.name}' is empty or does not exist.`);
              console.log('Make sure your project was compiled!');
              callback();
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
              callback();
            });

          });
        });
      });
  });
};