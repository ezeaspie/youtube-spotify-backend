const express  = require('express');
const fetch = require('node-fetch');
let request = require('request')
let querystring = require('querystring')

const app = express();

let redirect_uri = 
  process.env.REDIRECT_URI || 
  'http://localhost:8888/callback'

/*fetch('https://api.spotify.com/v1/users/{user_id}/playlists',{method:'GET'})
.then(res=>res.json())
.then(json => console.log(json));*/

app.set('view engine', 'ejs');

app.get("/",(req,res)=>{
    res.render("./pages/index");
})

app.get('/login', function(req, res) {
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: process.env.SPOTIFY_CLIENT_ID,
      scope: 'user-read-private user-read-email',
      redirect_uri
    }))
})

app.get('/callback', function(req, res) {
  let code = req.query.code || null
  let authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    form: {
      code: code,
      redirect_uri,
      grant_type: 'authorization_code'
    },
    headers: {
      'Authorization': 'Basic ' + (new Buffer(
        process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
      ).toString('base64'))
    },
    json: true
  }
  request.post(authOptions, function(error, response, body) {
    var access_token = body.access_token
    let uri = process.env.FRONTEND_URI || 'http://localhost:3000'
    res.redirect(uri + '?access_token=' + access_token)
  })
})

let port = process.env.PORT || 8888
console.log(`Listening on port ${port}. Go /login to initiate authentication flow.`)
app.listen(port);