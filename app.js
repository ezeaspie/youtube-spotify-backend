const express  = require('express');
let request = require('request');
let querystring = require('querystring');
const {google} = require('googleapis');
const cors = require('cors');
const bodyParser = require('body-parser');

//REDIRECT TO 

const app = express();
app.use(cors());
app.use(bodyParser.json());

//yotube Oauth flow

//SPOTIFY REDIRECT
let redirect_uri = 
  process.env.REDIRECT_URI || 
  'http://localhost:8888/callback'

const frontend_uri = 
  process.env.FRONTEND_URI ||
  'http://localhost:3000/'

const youtubeLoginUri = process.env.YOUTUBE_LOGIN_URI;

const youtubeCallbackURI = process.env.YOUTUBE_CALLBACK || 'http://localhost:8888/ytcallback'

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  youtubeCallbackURI
);

const url = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: `https://www.googleapis.com/auth/youtube`,
});

let spotify_access_token = undefined;

app.get("/",(req,res)=>{
  spotify_access_token = req.query.access_token;
  console.log(spotify_access_token);
  res.redirect(url);
})

//spotify Oauth Flow



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
    let uri = youtubeLoginUri || 'http://localhost:8888/'
    res.redirect(uri + '?access_token=' + access_token)
  })
})

app.post('/ytcallback', function(req, res) {
  // Get sent data.
  const data = req.body;
  const service = google.youtube('v3');


  let playlistVideoPromises = data.tracks.map((track)=>{

    return new Promise((resolve,reject)=>{
      console.log(track.name);
      let parameters = {'maxResults': '5',
      'part': 'snippet',
      'q': `${track.artists[0]} ${track.name}`,
      'type': ''
      }
      parameters['auth'] = oauth2Client;
      service.search.list(parameters, function(err, response) {
        if (err) {
          reject(Error('The API returned an error: ' + err));
          return;
        }
        console.log(response.data.items[0]);
        response.data.items[0].snippet.videoId = response.data.items[0].id.videoId;
        resolve(response.data.items[0].snippet);
      });
    })
  })

  Promise.all(playlistVideoPromises)
  .then(playlistVideoArray=>res.json(playlistVideoArray))
});

app.post('/generatePlaylist',(req,res)=>{
  var service = google.youtube('v3');
  let playlistURL;
  //Front end sends videoIds to add to playlist.
  const videoIds = req.body.videoIds;
  //Create the new Playlist
  const createNewPlaylist = () => {
    return new Promise((resolve,reject)=>{
      function createResource(properties) {
        var resource = {};
        var normalizedProps = properties;
        for (var p in properties) {
          var value = properties[p];
          if (p && p.substr(-2, 2) == '[]') {
            var adjustedName = p.replace('[]', '');
            if (value) {
              normalizedProps[adjustedName] = value.split(',');
            }
            delete normalizedProps[p];
          }
        }
        for (var p in normalizedProps) {
          // Leave properties that don't have values out of inserted resource.
          if (normalizedProps.hasOwnProperty(p) && normalizedProps[p]) {
            var propArray = p.split('.');
            var ref = resource;
            for (var pa = 0; pa < propArray.length; pa++) {
              var key = propArray[pa];
              if (pa == propArray.length - 1) {
                ref[key] = normalizedProps[p];
              } else {
                ref = ref[key] = ref[key] || {};
              }
            }
          };
        }
        return resource;
      }
    
      let parameters ={
        'part': 'snippet,status',
        'properties': {'snippet.title': `${req.body.playlistName}`,
        'status.privacyStatus': 'private'
        }
      }
    
        parameters['auth'] = oauth2Client;
        parameters['resource'] = createResource(parameters['properties']);
        service.playlists.insert(parameters, function(err, response) {
          if (err) {
            reject(Error('The API returned an error: ' + err));
            return;
          }
          let playlistID = response.data.id;
          playlistURL = `https://www.youtube.com/playlist?list=${playlistID}`
          console.log(response.data);
          resolve(playlistID);
        });
    })
  }

    //Add videos to the newly created Playlist

    function addToPlaylist(id,playlistID) {
      return new Promise((resolve,reject)=>{
        var details = {
          videoId: id,
          kind: 'youtube#video'
        }

        service.playlistItems.insert({
          part: 'snippet',
          auth : oauth2Client,
          resource: {
            snippet: {
              playlistId: playlistID,
              resourceId: details
            }
          }
        },(err,response)=>{
          if (err) {
            reject(Error('The API returned an error: ' + err));
            return;
          }
          setTimeout(()=>resolve(response),3000);
        });
      })
    }

    createNewPlaylist()
    .then(playlistID=>{
      let videoInsertPromises = videoIds.map(video=>{addToPlaylist(video,playlistID)});
      Promise.all(videoInsertPromises)
      .then(()=>{
        console.log("PLAYLIST CREATED"),
        res.json({playlistURL});
      });
    })
})

app.get("/ytcallback",(req,res)=>{
  //Authentication Code
  async function getToken () {
    const code = req.query.code;
    const {tokens} = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens);

    var service = google.youtube('v3');
    service.playlists.list({
      auth: oauth2Client,
      part: 'snippet',
      mine:true,
    }, function(err, response) {
      if (err) {
        console.log('The API returned an error: ' + err);
        return;
      }
      var playlists = response.data;
      if (playlists.length == 0) {
        console.log('No channel found.');
      } else {
          res.redirect(frontend_uri + '?access_token=' + spotify_access_token);
      }
    });
    
    
  }

  getToken();
})

let port = process.env.PORT || 8888
console.log(`Listening on port ${port}. Go /login to initiate authentication flow.`)
app.listen(port);