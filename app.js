const express = require('express');
const app = express();
app.use(express.static(__dirname));
const request = require('request');
const crypto = require("crypto");
const base64url = require('base64url')
const multer = require('multer')
const uploadFile = multer();


// ドロップボックスアプリに関する定数
const appkey                = "Xxx"; // アプリキー
// const appsecret             = "Yyy"; // アプリのシークレットキー(PKCEで実装するなら不要)
const authorizEndpointUrl   = 'https://www.dropbox.com/oauth2/authorize'; // 認可エンドポイントのURL
const tokenEndpointUrl      = 'https://api.dropbox.com/oauth2/token'; // トークンエンドポイントのURL
const uploadFileEndPointUrl = 'https://content.dropboxapi.com/2/files/upload'; // アップロードエンドポイントのURL

// 認可エンドポイントからのレスポンスを受け取るURL
const encordedCallbackUrl = encodeURIComponent("http://localhost:3000/callback");

let token = "";         // アクセストークン
let state = "";         // state
let codeVerifier = "";  // code_verifier
let codeChallenge = ""; // code_challenge

// トップページ
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/views/index.html');
});

// ユーザがが連携ボタンを押した時の処理（認可エンドポイントへリダイレクトする）
app.get('/authorization', (req, res) => {
    state         = base64url.fromBase64(crypto.randomBytes(96).toString("base64"));
    codeVerifier  = base64url.fromBase64(crypto.randomBytes(96).toString("base64"));
    codeChallenge = base64url.fromBase64(crypto.createHash('sha256').update(codeVerifier).digest().toString("base64"));

    const params = `?client_id=${appkey}&redirect_uri=${encordedCallbackUrl}&response_type=code&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

    res.redirect(authorizEndpointUrl + params);
});


// 認可エンドポイントからのレスポンスを受け取る
app.get('/callback', (req, res) => {

    // stateが一致しない場合は、トップページにリダイレクト
    if (req.query.state !== state) {
        console.log('state不一致');
        res.redirect('http://localhost:3000/');
        return;
    }

    // クライアントに返さず、アプリ側でトークンエンドポイントへPOSTする
    const code = req.query.code; // 認可コード
    const dataString = `grant_type=authorization_code&code=${code}&redirect_uri=${encordedCallbackUrl}&code_verifier=${codeVerifier}&client_id=${appkey}`;

    const options = {
        method: 'POST',
        url: tokenEndpointUrl,
        headers: {
            "Content-type": "application/x-www-form-urlencoded",
        },
        body: dataString,
        // auth: { // (PKCEで実装する場合は不要)
        //     user: appkey,
        //     password: appsecret,
        // },
    }

    // トークンエンドポイントへリクエスト
    request(options, (error, resTokenEndpoint, body) => {
        const bodyJson = JSON.parse(body);
        token = bodyJson.access_token;

        // トークンが取得できれば、正常なページにリダイレクト
        if (token !== "" && token !== undefined) {
            res.redirect('http://localhost:3000/uploadFilePage');
            return;
        }
        // トークンが取得できない場合、トップページにリダイレクト
        else {
            console.log('tokenが取得できませんでした');
            res.redirect('http://localhost:3000/');
            return;
        }
    });

});


// ファイルアップロード画面を返す
app.get('/uploadFilePage', (req, res) => {
    res.sendFile(__dirname + '/views/uploadFile.html');
})

// ファイルがアップロードされてくる
app.post('/uploadFile', uploadFile.single('file'), (req, res) => {

    const dropbox_API_arg = {
        "path": '/' + req.file.originalname, // ファイル名を設定
        "mode": "overwrite" // すでに同名ファイルが存在した場合の挙動
    }

    // DropboxAPIでリクエストヘッダーにJSONが含まれる場合にHTTPヘッダーセーフにする
    // 参考：https://www.dropbox.com/developers/reference/json-encoding
    const encoded_args = http_header_safe_json(dropbox_API_arg)

    const options = {
        method: 'POST',
        url: uploadFileEndPointUrl,
        headers : {
            'Content-type': 'application/octet-stream',
            'Authorization': 'Bearer ' + token,
            'Dropbox-API-Arg': encoded_args,
        },
        body: req.file.buffer,
    }

    // アップロードする
    request(options, (error, resUploadEndPoint, body) => {
        console.log(resUploadEndPoint);
        console.log(error);
    });
});


// DropboxAPIでDropbox-API-Argがリクエストのヘッダーに含まれる場合、
// 本メソッドでHTTPヘッダーセーフにする
function http_header_safe_json(v) {
    const charsToEncode = /[\u007f-\uffff]/g;
    return JSON.stringify(v).replace(charsToEncode,
        function(c) {
            return '\\u'+('000'+c.charCodeAt(0).toString(16)).slice(-4);
        }
    );
}

app.listen(3000);