const rp = require('request-promise');

function updateMasks(secret) {
    const port = process.env.PORT || 8080;
    const host = process.env.HOST || 'localhost';

    const opt = {
        uri: `http://${host}:${port}/secrets`,
        method: 'POST',
        json: true,
        body: secret,
        resolveWithFullResponse: true,
    };

    rp(opt)
        .then((res) => {
            if (res.statusCode >= 400) {
                console.log(`could not create mask for secret: ${secret.key}, because server responded with: ${res.statusCode}\n\n${res.body}`);
                process.exit(1);
            }
            console.log(`successfully updated masks with secret: ${secret.key}`);
            process.exit(0);
        })
        .catch((err) => {
            console.log(`could not create mask for secret: ${secret.key}, due to error: ${err}`);
            process.exit(1);
        });
}

if (require.main === module) {
    // first argument is the secret key second argument is the secret value
    if (process.argv.length < 4) {
        console.log('not enough arguments, need secret key and secret value');
        process.exit(2);
    }
    const key = process.argv[2];
    const value = process.argv[3];
    updateMasks({ key, value });
} else {
    module.exports = updateMasks;
}
