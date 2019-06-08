//Require the relevant dependencies.
const express = require('express');
const pug = require('pug');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const https = require('https');
const fs = require('fs');
const eValidator = require("email-validator");
const app = express();

//Import the config and other forum JSON files.
var forum = require('./forum.json');
var users = require('./users.json');
var config = require('./config.json');

//Set up the per-instance variables.
var tokens = [];
var postParser = require('marked');
postParser.setOptions({
  renderer: new postParser.Renderer(),
  highlight: function(code) {
    return require('highlight.js').highlightAuto(code).value;
  },
  pedantic: false,
  gfm: true,
  tables: true,
  breaks: false,
  sanitize: false,
  smartLists: true,
  smartypants: false,
  xhtml: false
});

//Configure the express instance.
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.set('view engine', 'pug');
app.set("views", "./views");

///////////////
/// ROUTING ///
///////////////

// If the site's under maintenence, uncomment this.
//app.get('*', function(req, res) {
//  res.render('maintenance');
//});

app.get('/', function(req, res) {
  //Get user info.
  var uinfo = getPageUserInfo(req.cookies.userSession);
  
  //Is there an error message?
  var errMessage = undefined;
  if (req.query.err != undefined) {
    errMessage = req.query.err;
  }
  
  //Render.
  res.render('index', 
  { 
    tab_title: config.name,
    title: config.title,
    userinfo: uinfo,
    news_posts: forum.news.slice(0, 3),
    tokens: tokens,
    error_message: errMessage,
    welcomeHeader: config.welcome_header,
    welcomeBody: config.welcome_body,
    markdown: postParser
  });
});

//The login route.
app.get('/login', function(req, res) {
  //Get user info.
  var uinfo = getPageUserInfo(req.cookies.userSession);
  
  //Is there an error message?
  var errMessage = undefined;
  if (req.query.err != undefined) {
    errMessage = req.query.err;
  }
  
  //Render.
  res.render('login',
  {
    tab_title: config.name + " - Login",
    title: config.title,
    error_message: errMessage,
    userinfo: uinfo,
    captcha_sitekey: config.RECAPTCHA_SITE_KEY
  });
});

//The signup route.
app.get('/register', function(req, res) {
  
  //Get user info.
  var uinfo = getPageUserInfo(req.cookies.userSession);
  
  //Is there an error message?
  var errMessage = undefined;
  if (req.query.err != undefined) {
    errMessage = req.query.err;
  }
  
  //Render.
  res.render('signup',
  {
    tab_title: config.name + " - Sign Up",
    title: config.title,
    error_message: errMessage,
    userinfo: uinfo,
    captcha_sitekey: config.RECAPTCHA_SITE_KEY
  });
});

//The post-signup route.
app.get('/register-done', function(req, res) {
  //Render, nothing special needed.
  res.render('post-signup',
  {
    tab_title: config.name + " - Done!",
    support_email: config.support_email,
    support_discord: config.support_discord
  });
});

//The logout route.
app.get('/logout', function(req, res) {
  //Is the user logged in? If so, clear the cookie and remove the token.
  if (req.cookies.userSession) {
    //Removing from token list.
    for (var i=0; i<tokens.length; i++) {
      if (tokens[i].token == req.cookies.userSession.token) {
        tokens.splice(i, 1);
        break;
      }
    }
    
    //Removing client side cookie, redir.
    res.clearCookie('userSession');
    res.redirect('/');
  }
});

//The admin panel route.
app.get('/admin', function(req, res) {
  
  //Get the user token and check if they're an admin.
  var uinfo = getPageUserInfo(req.cookies.userSession);
  
  //Are they admin?
  if (!uinfo.isadmin) {
    //No, redirect.
    res.redirect('/');
    return;
  }
  
  //Is there an error message?
  var errMessage = undefined;
  if (req.query.err != undefined) {
    errMessage = req.query.err;
  }
   
  //They are, render the admin page!
  res.render('admin', 
  {
    tab_title: config.name + " - Admin",
    title: config.title,
    users: users,
    boards: forum.boards,
    news: forum.news,
    badges: forum.badges,
    error_message: errMessage,
    userinfo: uinfo
  });
});

//The "edit news post" route from the admin panel.
app.get('/admin/editnews', function(req, res) {
  
  //Checking the user is an admin.
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.isadmin) {
    res.redirect('/');
    return;
  }
  
  //They are, which post are they editing?
  if (!req.query.post) {
    res.redirect('/admin?err=Invalid%20edit%20query%20parameters%2E');
    return;
  }
  
  //Attempt to get the post.
  var post = null;
  for (var i=0; i<forum.news.length; i++) {
    if (forum.news[i].id == req.query.post) {
      post = forum.news[i];
    }
  }
  
  //Check if the post was found.
  if (post==null) {
    res.redirect('/admin?err=Invalid%20post%20ID%20given%20for%20edit%2E');
    return;
  }
  
  //Pass in the info and render.
  res.render('editnewspost', 
  {
    tab_title: config.name + " - Edit Post",
    title: config.title,
    postid: req.query.post,
    posttitle: post.title,
    postbody: post.body,
    userinfo: uinfo
  });
  
});

//Editing a badge as admin.
app.get('/admin/editbadge', function(req, res) {

  //Checking the user is an admin.
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.isadmin) {
    res.redirect('/');
    return;
  }
  
  //Is there an error message?
  var errMessage = undefined;
  if (req.query.err != undefined) {
    errMessage = req.query.err;
  }
  
  //They are, which badge are they editing?
  if (!req.query.name) {
    res.redirect('/admin?err=Invalid%20edit%20query%20parameters%2E');
    return;
  }
  
  //Grab the badge to pass in.
  var badge = null;
  for (var i=0; i<forum.badges.length; i++) {
    if (forum.badges[i].name == req.query.name) {
      badge = forum.badges[i];
    }
  }
  
  if (badge==null) {
    res.redirect('/admin?err=Invalid badge name given.');
    return;
  }
  
  //Render.
  res.render('editbadge', {
    title: config.title,
    tab_title: config.name + " - Edit Badge",
    badge: badge,
    userinfo: uinfo,
    error_message: errMessage
  });
  
});

//Manage a user's badges as admin.
app.get('/admin/managebadges', function(req, res) {
  
  //Checking the user is an admin.
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.isadmin) {
    res.redirect('/');
    return;
  }
  
  //Is there an error message?
  var errMessage = undefined;
  if (req.query.err != undefined) {
    errMessage = req.query.err;
  }
  
  //They are, which user are they editing?
  if (!req.query.user) {
    res.redirect('/admin?err=Invalid%20edit%20query%20parameters%2E');
    return;
  }
  
  //Get the user.
  var user = null;
  for (var i=0; i<users.length; i++) {
    if (users[i].username == req.query.user) {
      user = users[i];
    }
  }
  
  if (user == null) {
    res.redirect('/admin?err=Invalid user given%2E');
    return;
  }
  
  //Rendering.
  res.render('managebadges',
  {
    tab_title: config.name + " - Manage Badges",
    title: config.title,
    userinfo: uinfo,
    user: user,
    error_message: errMessage
  });
});

//The news tab.
app.get('/news', function(req, res) {
  
  //Getting user info.
  var uinfo = getPageUserInfo(req.cookies.userSession);
  
  //Is there a page argument? Get the current page.
  var page = 1;
  if (req.query.page != undefined) {
    page = req.query.page;
  }
  if (page<0 || isNaN(page)) {
    page = 1;
  }
  
  //Get the right part of the news array.
  var news = forum.news.slice((page-1)*10, (page-1)*10 + 11);
  
  //Render.
  res.render('newspage', 
  {
    tab_title: config.name + " - News [" + page + "]",
    title: config.title,
    userinfo: uinfo,
    news: news,
    markdown: postParser,
    page: page
  });
  
});

//The boards list.
app.get('/boards', function(req, res) {
  
  //Getting user info.
  var uinfo = getPageUserInfo(req.cookies.userSession);
  
  //Is there an error message?
  var errMessage = undefined;
  if (req.query.err != undefined) {
    errMessage = req.query.err;
  }
  
  //Render.
  res.render('boards',
  {
    error_message: errMessage,
    tab_title: config.name + " - Boards",
    title: config.title,
    userinfo: uinfo,
    tokens: tokens,
    boards: forum.boards
  });
  
});

//Viewing a specific topic on a board.
app.get('/boards/view', function(req, res) {
  
  //Getting user info.
  var uinfo = getPageUserInfo(req.cookies.userSession);
  
  //Checking the board and topic, seeing if they're valid.
  if(!req.query.board || !req.query.topic) {
    res.redirect('/boards?err=Invalid%20board%20or%20topic%20name%2E');
    return;
  }
  
  //Get what page of posts we're on.
  var pagenum = 1;
  if (req.query.page != undefined) {
    pagenum = req.query.page;
  }
  if (pagenum<=0 || isNaN(pagenum)) {
    pagenum = 1;
  }
  
  //Attempting to grab topic.
  var index = -1;
  for (var i=0; i<forum.boards.length; i++){
    if (forum.boards[i].name == req.query.board) {
      index = i;
      break;
    }
  }
  
  //Checking if it was found.
  if (index==-1) {
    res.redirect('/boards?err=Invalid%20board%20or%20topic%20name%2E');
    return;
  }
  
  //Yep, find topic.
  var topic = null;
  for (var i=0; i<forum.boards[index].topics.length; i++) {
    if (forum.boards[index].topics[i].name == req.query.topic) {
      topic = forum.boards[index].topics[i];
      break;
    }
  }
  
  //Check if topic was found.
  if (topic == null) {
    res.redirect('/boards?err=Invalid%20board%20or%20topic%20name%2E');
    return;
  }
  
  //Get all posts from this topic. (make it the first 50 later)
  var posts = [];
  for (var i=0; i<topic.posts.length; i++) {
    //Load the post file.
    var postObj = loadJSON("posts/"+topic.posts[i]+".json");
    
    //Grabbing preview for this post.
    postObj.preview = postObj.replies[0].body.substring(0, 60) + "...";
    
    //Adding to list of posts.
    posts.push(postObj);
  }
  
  //Get all stickied posts if we're on the first page.
  var stickied_posts = [];
  if (pagenum==1) {
    for (var i=0; i<topic.stickied_posts.length; i++) {
      
      //Load the post file.
      var postObj = loadJSON("posts/"+topic.stickied_posts[i]+".json");

      //Grabbing preview for this post.
      postObj.preview = postObj.replies[0].body.substring(0, 60) + "...";

      //Adding to list of posts.
      stickied_posts.push(postObj);
      
    }
  }
  
  //Render.
  res.render('topic', 
  {
    tab_title: config.name + " - " + req.query.topic + " [" + pagenum + "]",
    title: config.title,
    userinfo: uinfo,
    tokens: tokens,
    boardname: req.query.board,
    topicname: req.query.topic,
    topicdesc: topic.description,
    locked: topic.locked,
    posts: posts,
    stickied_posts: stickied_posts
  });
  
});

//Route for seeing a post.
app.get('/post/view', function(req, res) {
  
  try{
    
  //Get user info.
  var uinfo = getPageUserInfo(req.cookies.userSession);
  
  //Get what page of replies we're on.
  var pagenum = 1;
  if (req.query.page != undefined) {
    pagenum = req.query.page;
  }
  if (pagenum<=0 || isNaN(pagenum)) {
    pagenum = 1;
  }
  
  //Is there an error message?
  var errMessage = undefined;
  if (req.query.err != undefined) {
    errMessage = req.query.err;
  }
  
  //Is there an ID attached to this query?
  if (req.query.id == undefined) {
    res.redirect('/?err=No%20post%20ID%20provided%2E');
    return;
  }
  
  //Check that the ID is valid.
  if (!fs.existsSync('posts/' + req.query.id + '.json')) {
    //No.
    res.redirect('/?err=Invalid%20post%20ID%20given%2E');
    return;
  }
  
  //Yep, load the post.
  var post = loadJSON('posts/' + req.query.id + ".json");
  
  //Load the right page of replies.
  post.replies = post.replies.slice((pagenum-1)*config.board_posts_per_page, (pagenum-1)*config.board_posts_per_page+config.board_posts_per_page);
  
  //Is replies blank? Redirect to previous page with error.
  if (post.replies.length <= 0) {
    res.redirect('/post/view?id=' + req.query.id + "&page="+ (pagenum-1) +"&err=That%20page%20does%20not%20exist%2E");
    return;
  }
  
  //For every reply in that list, load author data from file.
  for (var i=0; i<post.replies.length; i++) {
    
    var authorName = post.replies[i].author;
    
    //Getting user data for this name.
    var user = getUserFromName(authorName);
    if (user==null) {
      //Create a default user.
      user = {
        username: "Deleted User",
        description: "This account was deleted."
      }
    }
    
    //Get the status for this user.
    var status = "User";
    if (user.moderator) { status = "Moderator"; }
    if (user.admin) { status = "Admin"; }
    
    //Get the status colour for this user.
    var statuscolour = config.board_user_role_colour;
    if (status == "Moderator") { statuscolour = config.board_moderator_role_colour; }
    if (status == "Admin") { statuscolour = config.board_admin_role_colour; }
    
    //Setting the author object.
    post.replies[i].author = {
      username: user.username,
      description: user.description,
      status: status,
      statuscolour: statuscolour,
      profile_picture: user.profile_picture
    }
  }
  
  //Pass to renderer.
  res.render('viewpost', 
  {
    userinfo: uinfo,
    tab_title: post.name + " - " + config.name,
    error_message: errMessage,
    board: '',
    topic: '',
    title: config.title,
    post: post,
    page: pagenum,
    markdown: postParser,
    tokens: tokens
  });
  } catch(err) {
    res.redirect('/500');
  }
});

//Route for posting to a topic.
app.get('/post', function(req, res) {
  
  //Is the user logged in?
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.loggedin) {
    res.redirect('/');
    return;
  }
  
  //Is there an error message?
  var errMessage = undefined;
  if (req.query.err != undefined) {
    errMessage = req.query.err;
  }
  
  //Checking if the required parameters are there.
  if (!req.query.board || !req.query.topic) {
    res.redirect('/');
    return;
  }
  
  //Rendering.
  res.render('post', 
  {
    tab_title: config.name + " - Post",
    title: config.title,
    userinfo: uinfo,
    error_message: errMessage,
    board: req.query.board,
    topic: req.query.topic
  });
  
});

//Route for editing a reply to a post.
app.get('/post/edit', function(req, res) {
  
  //Is the user logged in?
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.loggedin) {
    res.redirect('/');
    return;
  }
  
  //Checking a post and ID are specified.
  if (req.query.post == undefined || req.query.id == undefined) {
    res.redirect('/?err=Invalid%20post%20or%20reply%20ID%20given%2E');  
  }
  
  //Get the relevant post.
  if (!fs.existsSync('posts/' + req.query.post + '.json')) {
    //No.
    res.redirect('/?err=Invalid%20post%20ID%20given%2E');
    return;
  }
  
  //Yep, load the post.
  var post = loadJSON('posts/' + req.query.post + ".json");
  
  //Check for the correct reply.
  var reply = null;
  for (var i=0; i<post.replies.length; i++) {
    if (post.replies[i].id == req.query.id) {
      reply = post.replies[i];
      break;
    }
  }
  
  //Checking the reply was found.
  if (reply == null) {
    //No.
    res.redirect('/?err=Invalid%20reply%20ID%20given%2E');
    return;
  }
  
  //Rendering.
  res.render('editpost', 
  {
    tab_title: config.name + ' - Edit',
    title: config.title,
    userinfo: uinfo,
    post: req.query.post,
    reply: req.query.id,
    postbody: reply.body
  });
});

//Reply to a post.
app.get('/post/reply', function(req, res) {
  
  //Is the user logged in?
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.loggedin) {
    res.redirect('/');
    return;
  }
  
  //Check the relevant queries are here.
  if (req.query.id == undefined) {
    res.redirect('/?err=Invalid%20post%20ID%20given%2E');  
  }
  
  //Get the relevant post.
  if (!fs.existsSync('posts/' + req.query.id + '.json')) {
    //No.
    res.redirect('/?err=Invalid%20post%20ID%20given%2E');
    return;
  }
  
  //Yep, load the post.
  var post = loadJSON('posts/' + req.query.id + ".json");
  
  //Render the reply screen.
  res.render('postreply',
  {
    tab_title: config.name + " - Reply",
    title: config.title,
    postname: post.name,
    postid: req.query.id,
    userinfo: uinfo
  });
});

//See a user's account.
app.get('/users', function(req, res) {
  
  //Get user info.
  var uinfo = getPageUserInfo(req.cookies.userSession);
  
  //Check if an ID is provided.
  if (req.query.id == undefined) {
    res.redirect('/?err=No%20user%20ID%20provided%2E');
    return;
  }
  
  //Grab that user's profile.
  var user = null;
  for(var i=0; i<users.length; i++) {
    if (users[i].username == req.query.id) {
      user = users[i];
    }
  }
  
  //Check the user was found.
  if (user == null) {
    res.redirect('/?err=Invalid%20user%20ID%20provided%2E');
    return;
  }
  
  //Grab the user's post titles.
  var posts = [];
  for (var i=0; i<user.posts.length; i++) {
    
    //If i has got to 20, 20 already added (max). Break.
    if (i==20) {
      break;
    }
    
    //Load the post JSON.
    //Get the relevant post.
    if (!fs.existsSync('posts/' + user.posts[i] + '.json')) {
      //No.
      res.redirect('/?err=Invalid%20post%20ID%20given%2E');
      return;
    }

    //Yep, load the post.
    var post = loadJSON('posts/' + user.posts[i] + ".json");
    
    //Get the title and a preview, and save that to posts.
    posts.push({
      title: post.name,
      preview: post.replies[0].body.substring(0, 60) + '...',
      id: post.id
    });
  }
  
  //Get the user's replied posts.
  var replies = [];
  for (var i=0; i<user.replies.length; i++) {
    
    if (i==20) {
      //20 posts already added, reached the max. Break.
      break;
    }
    
    //Get the relevant post.
    if (!fs.existsSync('posts/' + user.replies[i][0] + '.json')) {
      
      //Post no longer exists, ignore.
      continue;
      
    }

    //Yep, load the post.
    var post = loadJSON('posts/' + user.replies[i][0] + ".json");
    
    //Get the title and a preview, and save that to posts.
    replies.push({
      title: post.name,
      id: post.id,
      author: post.replies[0].author
    });
  }
  
  //Remove duplicate replies.
  var uniqueNames = [];
  var uniqueReplies = [];
  for (var i=0; i<replies.length; i++) {
    
    if (!uniqueNames.includes(replies[i].id)) {
      uniqueReplies.push(replies[i]);
      uniqueNames.push(replies[i].id);
    }
    
  }
  
  //Get the badges from badge list.
  var badges = [];
  for (var i=0; i<user.badges.length; i++) {
    for (var j=0; j<forum.badges.length; j++) {
      if (user.badges[i] == forum.badges[j].name) {
        badges.push(forum.badges[j]);
        break;
      }
    }
  }
  
  //Render the page.
  res.render('userprofile', 
  {
    userinfo: uinfo,
    title: config.title,
    tab_title: user.username + ' - ' + config.name,
    tokens: tokens,
    user: user,
    posts: posts,
    replies: uniqueReplies,
    globalPostAmt: forum.post_index - 1000000,
    modColour: config.board_moderator_role_colour,
    adminColour: config.board_admin_role_colour,
    amtPosts: user.posts.length,
    amtReplies: user.replies.length,
    markdown: postParser,
    defaultAbout: config.user_about_default,
    badges: badges
  });
  
});

//Edit a user account.
app.get('/users/edit', function(req, res) {
  
  //Is the user logged in?
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.loggedin) {
    res.redirect('/');
    return;
  }
  
  //Is there an error message?
  var errMessage = undefined;
  if (req.query.err != undefined) {
    errMessage = req.query.err;
  }
  
  //Get the user's info.
  var user = null;
  for (var i=0; i<users.length; i++) {
    if (users[i].username == uinfo.username) {
      user = users[i];
    }
  }
  
  //Check if found.
  if (user == null) {
    res.redirect('/?err=Invalid%20login%20user%2E');
    return;
  }
  
  //Yep, render the page.
  res.render('editprofile',
  {
    userinfo: uinfo,
    title: config.title,
    tab_title: config.name + ' - Edit Profile',
    user: user,
    error_message: errMessage
  });
  
});

//View the user directory.
app.get('/directory', function(req, res) {
  
  //Getting user info.
  var uinfo = getPageUserInfo(req.cookies.userSession);
  
  //Rendering.
  res.render('users', 
  {
    tab_title: config.name + ' - Users',
    title: config.title,
    userinfo: uinfo,
    users: users,
    tokens: tokens
  });
});

//View a badge.
app.get('/badges', function(req, res) {
  
  //Getting user info.
  var uinfo = getPageUserInfo(req.cookies.userSession);
  
  //Checking if there's a specified badge.
  if (req.query.name == undefined) {
    //No, show all.
    res.render('allbadges', {
      title: config.title,
    tab_title: config.name + " - Badges",
    userinfo: uinfo,
    badges: forum.badges
    });
    return;
  }
  
  //Get the badge which needs to be shown.
  var badge = null;
  for (var i=0; i<forum.badges.length; i++) {
    if (forum.badges[i].name == req.query.name) {
      badge = forum.badges[i];
      break;
    }
  }
  
  if (badge == null) {
    res.redirect('/?err=Invalid badge name%2E');
    return;
  }
  
  //Render.
  res.render('badges', {
    title: config.title,
    tab_title: config.name + " - " + req.query.name,
    userinfo: uinfo,
    badge: badge
  });
  
});

//////////////////
/// API ROUTES ///
//////////////////

//The login POST route.
app.post('/api/login', function(req, res) {
  
  //Check if the recaptcha is valid.
  //verifyRecaptcha(req.body["g-recaptcha-response"], function(parsed) {
      //if (!parsed.success) {
        //res.redirect('/login?err=Failed%20the%20captcha%2E');
        //return;
      //} else {
        
        //Getting the existing hash from user DB, if the user exists.
        var found = false;
        var existingHash = null;
        for (var i=0; i<users.length; i++) {
          if (users[i].username == req.body.username) {
            existingHash = users[i].hash;
            found = true;
            
            //Is the user's account verified?
            if (!users[i].verified) {
              res.redirect('/login?err=This%20account%20is%20not%20yet%20verified%2E');
              return;
            }
            
            break;
          }  
        }

        //User doesn't exist, redirect.
        if (!found) {
          res.redirect('/login?err=Invalid%20username%20given%2E');
          return;
        }
        
        //Hash password, check if it's valid.
        bcrypt.compare(req.body.password, existingHash).then(function (hashRes) {

          if (hashRes) {
            //Correct password.
            //Is the given user already logged in?
            for (var i=0; i<tokens.length; i++) {
              if (tokens[i]==req.body.username) {
                //Remove their user session, break.
                tokens.splice(i, 1);
                break;
              }
            }

            //Return a valid token for that user.
            var token = 
            {
              token: randomAlphaNumString(512)
            };
            res.cookie('userSession', token, { maxAge: 90000000, httpOnly: true });
            
            //Adding token to list.
            tokens.push({token: token.token, user: req.body.username});
            
            //Redirecting back to home page.
            res.redirect('/');
            
            return;
          } else {
            //Invalid password, redirect.
            res.redirect('/login?err=Invalid%20password%20given%2E');
            return;
          }
        });
      //}
   //});
});

//The registration POST route.
app.post('/api/signup', function(req, res) {
  
  //Verify the captcha.
  verifyRecaptcha(req.body["g-recaptcha-response"], function(parsed) {
      if (!parsed.success) {
        console.log(req.body["g-recaptcha-response"]);
        res.redirect('/register?err=Failed%20the%20captcha%2E');
        return;
      } else {
        
        //Valid captcha, check if the passwords are the same.
        if (req.body.password != req.body.password_repeat) {
          res.redirect('/register?err=Passwords%20are%20not%20the%20same%2E');
          return;
        }
        
        //Check the username is valid (no spaces or special chars).
        if (req.body.username.includes(' ') || !isAlphaNumeric(req.body.username)) {
          res.redirect('/register?err=Usernames%20cannot%20contain%20special%20characters%2E');
          return;
        }
        
        //Check the username is longer than 0 characters, and shorter than 30.
        if (req.body.username.length<=0 || req.body.username.length>30) {
          res.redirect('/register?err=Username%20must%20be%20between%201%20and%2030%20characters%2E');
          return;
        }
        
        //Does this user already exist?
        for (var i=0; i<users.length; i++) {
          if (users.username == req.body.username) {
            res.redirect('/register?err=A%20user%20with%20this%20name%20already%20exists%2E');
            return;
          }
        }
        
        //Checking the email is valid.
        if (!eValidator.validate(req.body.email)) {
          res.redirect('/register?err=Invalid%20email%20provided%2E');
          return;
        }
        
        //Doesn't already exist, so create the user.
        bcrypt.hash(req.body.password, 10, function(err, hash) {
          if (err) {
            console.log("FATAL HASHING ERROR: " + err);
            res.redirect('/register?err=Cannot%20create%20a%20new%20user%20at%20this%20time%2E');
            return;
          }
          
          var user = {
            username: req.body.username,
            hash: hash,
            email: req.body.email,
            description: config.user_description_default,
            verified: false,
            moderator: false,
            admin: false,
            posts: [],
            replies: [],
            contacts: {
              discord: '',
              email: '',
              reddit: '',
              twitter: '',
              youtube: ''
            },
            badges: [],
            about: '',
            creationDate: (new Date()).toLocaleString('en-GB', { timeZone: 'Europe/London' }),
            profile_picture: config.user_profile_picture_default
          };
          
          //Adding to users list.
          users.push(user);
          saveJSON(users, "users.json");
          
          //Redirecting to the post-reg page.
          res.redirect('/register-done');
          return;
        });
      }
  });
  
});

//POST route for managing users.
app.post('/api/manageuser', function(req, res) {
  
  //Checking the user is an admin.
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.isadmin) {
    res.redirect('/');
    return;
  }
  
  //Find the user in the list.
  var index = -1;
  for(var i=0; i<users.length; i++) {
    if (users[i].username == req.query.user) {
      //Found.
      index = i;
    }
  }
  
  //Didn't find the user.
  if (index==-1) {
    res.redirect('/admin?err=Invalid%20user%20detected%2E');
    return;
  }
  
  //Set the user's properties.
  users[index].verified = (req.body.verified=="on");
  users[index].moderator = (req.body.moderator=="on");
  users[index].admin = (req.body.admin=="on");
  
  //Saving JSON.
  saveJSON(users, "users.json");
  
  //Redirect back.
  res.redirect('/admin');
});

//GET route for deleting a user.
app.get('/api/deleteuser', function(req, res) {
  
  //Checking the user is an admin.
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.isadmin) {
    res.redirect('/');
    return;
  }
  
  //Find the user in the list.
  var index = -1;
  for(var i=0; i<users.length; i++) {
    if (users[i].username == req.query.id) {
      //Found.
      index = i;
    }
  }
  
  //Didn't find the user.
  if (index==-1) {
    res.redirect('/admin?err=Invalid%20user%20detected%2E');
    return;
  }
  
  //Removing user.
  users.splice(index, 1);
  
  //Saving, redirecting.
  saveJSON(users, "users.json");
  res.redirect('/admin');
});

//POST route for adding a new board.
app.post('/api/createboard', function(req, res) {
  //Is the user admin?
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.isadmin) {
    res.redirect('/');
    return;
  }
  
  //Does this board already exist?
  for (var i=0; i<forum.boards.length; i++) {
    if (forum.boards[i].name == req.body.board_name) {
      res.redirect('/admin?err=A%20board%20with%20this%20name%20already%20exists%2E');
      return;
    }
  }
  
  //No, create it!
  forum.boards.push({
    name: req.body.board_name,
    description: req.body.board_desc,
    topics: []
  });
  
  console.log("Added a new board "+req.body.board_name+".");
  
  //Save to JSON.
  saveJSON(forum, "forum.json");
  
  //Redirect back to main admin panel.
  res.redirect('/admin');
});

//GET route for deleting a board.
app.get('/api/deleteboard', function(req, res) {
  //Is the user admin?
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.isadmin) {
    res.redirect('/');
    return;
  }
  
  //Find and delete the board.
  for (var i=0; i<forum.boards.length; i++) {
    if (forum.boards[i].name == req.query.board) {
      forum.boards.splice(i, 1);
      saveJSON(forum, "forum.json");
      res.redirect('/admin');
      return;
    }
  }
  
  //Didn't find it, redirect to error message.
  res.redirect('/admin?err=Could%20not%20delete%20board%2Cinvalid%20board%20name%2E');
});

//POST method for creating a topic in a board.
app.post('/api/createtopic', function(req, res) {
  
  //Is the user admin?
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.isadmin) {
    res.redirect('/');
    return;
  }
  
  //Find the relevant board.
  var index = -1;
  for (var i=0; i<forum.boards.length; i++) {
    if (forum.boards[i].name == req.query.board) {
      index = i;
      break;
    }
  }
  
  //Was it found?
  if (index==-1) {
    res.redirect('/admin?err=Invalid%20board%20name%20when%20trying%20to%20add%20topic%2E');
    return;
  }
  
  //Yes, now check the topic isn't a dupe.
  for (var i=0; i<forum.boards[index].topics.length; i++) {
    if (forum.boards[index].topics[i].name == req.body.topicname) {
      res.redirect('/admin?err=A%20topic%20with%20this%20name%20already%20exists%2E');
      return;
    }
  }
  
  //Not a dupe, so add.
  forum.boards[index].topics.push({
    name: req.body.topicname,
    description: req.body.topicdesc,
    posts: [],
    stickied_posts: [],
    locked: false
  });
  
  console.log("Added a new topic to board " + req.query.board + " called " + req.body.topicname + ".");
  
  //Save.
  saveJSON(forum, 'forum.json');
  
  res.redirect('/admin');
});

//GET method to delete topic.
app.get('/api/deletetopic', function(req, res) {
  
  //Is the user admin?
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.isadmin) {
    res.redirect('/');
    return;
  }
  
  //Yep, so get the board index.
  var boardIndex = -1;
  for (var i=0; i<forum.boards.length; i++) {
    if (forum.boards[i].name == req.query.board) {
      boardIndex = i;
      break;
    }
  }
  
  //Attempt to find the topic and remove it.
  for (var i=0; i<forum.boards[boardIndex].topics.length; i++) {
    if (forum.boards[boardIndex].topics[i].name == req.query.topic) {
      forum.boards[boardIndex].topics.splice(i, 1);
      saveJSON(forum, "forum.json");
      res.redirect('/admin');
      return;
    }
  }
  
  //Didn't find it, error.
  res.redirect('/admin?err=Could%20not%20find%20the%20selected%20topic%20to%20delete%20it%2E');
});

//POST route for adding a new news piece.
app.post('/api/createnews', function(req, res) {
  
  //Is the user admin?
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.isadmin) {
    res.redirect('/');
    return;
  }
  
  //Yep, create the post. Insert it at index 0 (newest).
  forum.news.splice(0, 0, {
    title: req.body.newstitle,
    author: uinfo.username,
    body: req.body.newsbody,
    date: (new Date()).toLocaleString('en-GB', { timeZone: 'Europe/London' }),
    id: forum.news_index
  });
  
  //Increment index.
  forum.news_index++;
  
  //Save JSON, then redirect.
  saveJSON(forum, 'forum.json');
  res.redirect('/admin');
});

//GET route to delete a news post.
app.get('/api/deletenews', function(req, res) {
  
  //Is the user admin?
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.isadmin) {
    res.redirect('/');
    return;
  }
  
  //Yep, now find and delete the post.
  for (var i=0; i<forum.news.length; i++) {
    if (forum.news[i].id == req.query.post) {
      forum.news.splice(i, 1);
      saveJSON(forum, 'forum.json');
      res.redirect('/admin');
      return;
    }
  }
  
  //Didn't find it, show error.
  res.redirect('/admin?err=Failed%20to%20delete%20news%2E');
});

//POST route for editing news posts.
app.post('/api/editnews', function(req, res) {
  
  //Is the user admin?
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.isadmin) {
    res.redirect('/');
    return;
  }
  
  //Yep, find the post that they're trying to edit.
  for (var i=0; i<forum.news.length; i++) {
    if (forum.news[i].id == req.query.post) {
      
      //Found it. Apply changes.
      forum.news[i].title = req.body.newstitle;
      forum.news[i].body = req.body.newsbody;
      
      //Save JSON, redirect.
      saveJSON(forum, 'forum.json');
      res.redirect('/admin');
      return;
      
    }
  }
  
  //Didn't find it, error redirect.
  res.redirect('/admin?err=Could%20not%20find%20post%20to%20edit%2E');
});

//POST route for posting to a topic.
app.post('/api/post', function(req, res) {
   
  //Check if the user is logged in.
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.loggedin) {
    res.redirect('/');
    return;
  }
  
  //Get the board specified.
  var boardIndex = -1;
  for (var i=0; i<forum.boards.length; i++) {
    if (forum.boards[i].name == req.query.board) {
      boardIndex = i;
      break;
    }
  }
  
  //Check if found.
  if (boardIndex == -1) {
    res.redirect('/post?board='+req.query.board+"&topic="+req.query.topic+"&err=Invalid%20board%20given%2E");
    return;
  }
  
  //Get the topic.
  var topicIndex = -1;
  for (var i=0; i<forum.boards[boardIndex].topics.length; i++) {
    if (forum.boards[boardIndex].topics[i].name == req.query.topic) {
      topicIndex = i;
      break;
    }
  }
  
  //Check if found.
  if (topicIndex == -1) {
    res.redirect('/post?board='+req.query.board+"&topic="+req.query.topic+"&err=Invalid%20topic%20given%2E");
    return;
  }
  
  //Checking if the topic is locked.
  if (forum.boards[boardIndex].topics[topicIndex].locked) {
    res.redirect('/boards?err=This topic is locked%2E');
    return;
  }
  
  //Create the post in posts/[id].json.
  var post = {
    name: req.body.posttitle,
    id: forum.post_index,
    replies: [
      {
        author: uinfo.username,
        body: req.body.postbody,
        date: (new Date()).toLocaleString('en-GB', { timeZone: 'Europe/London' }),
        id: 0
      }
    ],
    replyIndex: 1,
    locked: false,
    date: (new Date()).toLocaleString('en-GB', { timeZone: 'Europe/London' })
  };
  saveJSON(post, "posts/"+forum.post_index+".json");
  
  //Add the relevant post ID to the topic.
  forum.boards[boardIndex].topics[topicIndex].posts.splice(0, 0, forum.post_index);
  
  //Find the user's account in the list (to add the post to their account).
  var found = false;
  for (var i=0; i<users.length; i++) {
    if (users[i].username == uinfo.username) {
      //Found! Push the post.
      users[i].posts.splice(0, 0, forum.post_index);
    }
  }
  
  //Increment post ID, save forum and users.
  forum.post_index++;
  saveJSON(forum, "forum.json");
  saveJSON(users, "users.json");
  
  //Redirect back to the board.
  res.redirect('/boards/view?board='+req.query.board+'&topic='+req.query.topic);
});

//POST route for editing a post or reply.
app.post('/api/editreply', function(req, res) {
  
  //Check the user is logged in.
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.loggedin) {
    res.redirect('/');
    return;
  }
  
  //Check the parameters provided are correct.
  if (req.query.post == undefined || req.query.id == undefined) 
  {
    res.redirect('/?err=Invalid%20post%20or%20reply%20ID%2E');
    return;
  }
  
  //Get the post. Does it exist?
  if (!fs.existsSync('posts/' + req.query.post + '.json')) {
    //No.
    res.redirect('/?err=Invalid%20post%20ID%20given%2E');
    return;
  }
  
  //Yep, load the post.
  var post = loadJSON('posts/' + req.query.post + ".json");
  
  //Is it locked?
  if (post.locked) {
    res.redirect('/post/view?id='+req.query.post+'&err=This post is locked%2E'); 
  }
  
  //Check for the correct reply.
  var reply = null;
  var replyIndex = -1;
  for (var i=0; i<post.replies.length; i++) {
    if (post.replies[i].id == req.query.id) {
      reply = post.replies[i];
      replyIndex = i;
      break;
    }
  }
  
  //Checking the reply was found.
  if (reply == null) {
    //No.
    res.redirect('/?err=Invalid%20reply%20ID%20given%2E');
    return;
  }
  
  //Check the post's author is the same as the user requesting.
  if (uinfo.username != reply.author) {
    res.redirect('/?err=Unauthorised%20edits%20not%20permitted%2EYour%20actions%20will%20be%20reviewed%20by%20a%20moderator%2E');
    console.log("UNAUTHORIZED EDIT ATTEMPT MADE BY USER " + uinfo.username + ".");
    return;
  }
  
  //Set the body of the message!
  reply.body = req.body.replybody;
  
  //Save to post and then save JSON.
  post.replies[replyIndex] = reply;
  saveJSON(post, 'posts/'+req.query.post+'.json');
  
  //Redirect back to post.
  res.redirect('/post/view?id='+req.query.post);
});

//GET route for sticky-ing a post.
app.get('/api/sticky', function(req, res) {
  //Sticky ON.
  stickySwap(req, res, true);
});

//GET route for un sticky-ing a post.
app.get('/api/unsticky', function(req, res) {
  //Sticky OFF.
  stickySwap(req, res, false);
});

//GET route for deleting a post.
app.get('/api/deletepost', function(req, res) {
  
  //Checking if query parameters are correct.
  if (req.query.id == undefined || req.query.reply == undefined) {
    res.redirect('/');
    return;
  }
  
  //Get the post. Does it exist?
  if (!fs.existsSync('posts/' + req.query.id + '.json')) {
    //No.
    res.redirect('/post/view?id='+req.query.id+'?err=Invalid%20post%20ID%20given%2E');
    return;
  }

  //Yep, load the post.
  var post = loadJSON('posts/' + req.query.id + ".json");
  
  //Loop to find the reply.
  var repfound = false;
  var replyIndex = -1;
  for (var i=0; i<post.replies.length; i++) {
    if (post.replies[i].id == req.query.reply) {
      replyIndex = i;
      repfound = true;
      break;
    }
  }
  
  if (repfound==false) {
    res.redirect('/');
    return;
  }
  
  //Is the user moderator or above, or the author?
  var uinfo = getPageUserInfo(req.cookies.userSession);
  var isauthor = (uinfo.username == post.replies[replyIndex].author);
  if (!uinfo.ismoderator && !uinfo.isadmin && !isauthor) {
    res.redirect('/');
    return;
  }
  
  //Deleting origin reply?
  if (req.query.reply==0) {
    
    //Yep, find and delete the listing inside forum.json.
    var found = false;
    for (var i=0; i<forum.boards.length; i++) {
      for (var j=0; j<forum.boards[i].topics.length; j++) {
        for (var k=0; k<forum.boards[i].topics[j].posts.length; k++) {
          if (forum.boards[i].topics[j].posts[k] == req.query.id) {
            forum.boards[i].topics[j].posts.splice(k, 1);
            found = true; break;
          }
        }

        if (found){break;}
      }

      if (found){break;}
    }

    //Check if it was found.
    if (!found) {
      res.redirect('/boards?err=Could%20not%20find%20post%20listing%20to%20delete%2E');
      return;
    }

    //Save forum JSON.
    saveJSON(forum, 'forum.json');

    //Shifting post from the main posts folder to the deleted folder.
    fs.rename('posts/'+req.query.id+'.json', 'posts/deleted/'+req.query.id+'.json', function(err) {
      if (err) {
        res.redirect('/boards?err=Successfully%20delisted,%20but%20could%20not%20be%20removed%20from%20disk%2E');
        return;
      } else{
        
        //Find the user in the users list.
        var userIndex = -1;
        for(var i=0; i<users.length; i++) {
          if (users[i].username == post.replies[replyIndex].author) {
            userIndex = i;
          }
        }

        //Found?
        if (userIndex == -1) {
          res.redirect('/?err=Invalid%20user%20ID%2E');
          return;
        }

        var foundID = false;
        for(var i=0; i<users[userIndex].posts.length; i++) {
          console.log(users[userIndex].posts[i] + " == " + req.query.id);
          if (users[userIndex].posts[i] == req.query.id) {
            users[userIndex].posts.splice(i, 1);
            foundID = true;
            break;
          }
        }
        
        if (!foundID) {
          res.redirect('/?err=Could not find post listing in user profile%2E');
          return;
        }
        
        //Save user JSON.
        saveJSON(users, 'users.json');

        //Redirect back to boards.
        res.redirect('/boards');
      }
    });
  } else {
    //Splicing reply.
    console.log("got here");
    post.replies.splice(replyIndex, 1);
    
    //Saving to post JSON.
    saveJSON(post, 'posts/' + req.query.id + ".json");
    
    //Redirecting back to post.
    res.redirect('/post/view?id='+req.query.id);
  }
});

//Sticky on/off method.
function stickySwap(req, res, stickyStatus) {
  //Is the user moderator or above?
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.ismoderator && !uinfo.isadmin) {
    res.redirect('/');
    return;
  }
  
  //Are the query params present?
  if (req.query.board == undefined || req.query.topic == undefined || req.query.id == undefined) {
    res.redirect('/boards?err=Missing%20sticky%20parameters%2E');
    return;
  }
  
  //Yep, get the correct board and topic.
  var boardIndex = -1;
  for (var i=0; i<forum.boards.length; i++) {
    if (forum.boards[i].name == req.query.board) {
      boardIndex = i;
    }
  }
  
  //Found the right board?
  if (boardIndex == -1) {
    res.redirect('/boards?err=Failed%20to%20find%20board%2E');
    return;
  }
  
  //Find the topic.
  var topicIndex = -1;
  for (var i=0; i<forum.boards[boardIndex].topics.length; i++) {
    if (forum.boards[boardIndex].topics[i].name == req.query.topic) {
      topicIndex = i;
    }
  }
  
  //Found the right topic?
  if (topicIndex == -1) {
    res.redirect('/boards?err=Failed%20to%20find%20topic%2E');
    return;
  }
  
  //Check that the specified post is contained in this topic.
  var inTopic = false;
  
  if (!stickyStatus) {
    for (var i=0; i<forum.boards[boardIndex].topics[topicIndex].stickied_posts.length; i++) {
      if (forum.boards[boardIndex].topics[topicIndex].stickied_posts[i] == req.query.id) {
        
        //Found.
        inTopic = true;
        
        //Swap to unstickied.
        var post = forum.boards[boardIndex].topics[topicIndex].stickied_posts[i];
        forum.boards[boardIndex].topics[topicIndex].stickied_posts.splice(i, 1);
        forum.boards[boardIndex].topics[topicIndex].posts.splice(0, 0, post);
        break;
      }
    }
  } else {
    for (var i=0; i<forum.boards[boardIndex].topics[topicIndex].posts.length; i++) {
      
      if (forum.boards[boardIndex].topics[topicIndex].posts[i] == req.query.id) {
        //Found.
        inTopic = true;
        
        //Swap to stickied.
        var post = forum.boards[boardIndex].topics[topicIndex].posts[i];
        forum.boards[boardIndex].topics[topicIndex].posts.splice(i, 1);
        forum.boards[boardIndex].topics[topicIndex].stickied_posts.splice(0, 0, post);
        break;
      }
    }
  }
  
  //Check if the post was found.
  if (!inTopic) {
    res.redirect('/boards?err=Could%20not%20find%20post%20in%20topic%2E');
    return;
  }
  
  //Save forum JSON.
  saveJSON(forum, 'forum.json');
  
  //Redirect back to the topic.
  res.redirect('/boards/view?board='+req.query.board+'&topic='+req.query.topic);
}

//POST route for replying to a post.
app.post('/api/reply', function(req, res) {
  
  //Check the user is logged in.
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.loggedin) {
    res.redirect('/');
    return;
  }
  
  //Check the ID parameter is there.
  if (req.query.id == undefined) {
    res.redirect('/');
  }
  
  //Get the post. Does it exist?
  if (!fs.existsSync('posts/' + req.query.id + '.json')) {
    //No.
    res.redirect('/post/view?id='+req.query.id+'?err=Invalid%20post%20ID%20given%2E');
    return;
  }
  
  //Yep, load the post.
  var post = loadJSON('posts/' + req.query.id + ".json");
  
  //Is it locked?
  if (post.locked) {
    res.redirect('/post/view?id='+req.query.id+'&err=This post is locked%2E');
    return;
  }
  
  //Add a reply to the end.
  post.replies.push({
    author: uinfo.username,
    body: req.body.replybody,
    id: post.replyIndex,
    date: (new Date()).toLocaleString('en-GB', { timeZone: 'Europe/London' })
  });
  
  //Getting the user and adding this as a reply.
  var found = false;
  for (var i=0; i<users.length; i++) {
    if (users[i].username == uinfo.username) {
      
      //Found.
      found = true;
      users[i].replies.splice(0, 0, [req.query.id, post.replyIndex]);
      
    }
  }
  
  //Increment reply index.
  post.replyIndex++;
  console.log(post);
  
  //Saving to post JSON.
  saveJSON(post, 'posts/' + req.query.id + ".json");
  
  if (!found) {
    res.redirect('/?err=Could not find user to add reply to profile%2E');
    return;
  }
  
  //Saving user JSON.
  saveJSON(users, "users.json");
  
  //Redirect back to post.
  res.redirect('/post/view?id='+req.query.id);
});

//POST method for editing profile info.
app.post('/api/editprofile', function(req, res) {
  
  //Check the user is logged in.
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.loggedin) {
    res.redirect('/');
    return;
  }
  
  //Check if the image URL is valid.
  if (!isPicture(req.body.profile_picture) && req.body.profile_picture != '') {
    res.redirect('/users/edit?err=Invalid%20image%20URL%20(Must end in an image extension).');
    return;
  }
  
  //Check the status is 100 characters long or less.
  if (req.body.status.length > 100) {
    res.redirect('/users/edit?err=Status%20is%20longer%20than%100%20characters%2E');
    return;
  }
  
  //Check the status is 1000 characters long or less.
  if (req.body.description.length > 1000) {
    res.redirect('/users/edit?err=About is longer than 1000 characters%2E');
    return;
  }
  
  //Check all contact info is 100 characters long or less.
  if (req.body.discord.length > 100 || req.body.email.length > 100 || req.body.reddit.length > 100 || req.body.twitter.length > 100 || req.body.youtube.length > 100) {
    res.redirect('/users/edit?err=Contact info is too long (must be under 100 characters)%2E');
    return;
  }
  
  //Find this user in the users list.
  var userIndex = -1;
  for (var i=0; i<users.length; i++) {
    if (users[i].username == uinfo.username) {
      userIndex = i;
      break;
    }
  }
  
  //Found?
  if (userIndex == -1) {
    res.redirect('/users/edit?err=Could%20not%20find%20user%20to%20edit%2E');
    return;
  }
  
  //Yep, set properties then save and redirect.
  users[userIndex].description = req.body.status;
  users[userIndex].about = req.body.description;
  users[userIndex].profile_picture = req.body.profile_picture;
  users[userIndex].contacts.discord = req.body.discord;
  users[userIndex].contacts.email = req.body.email;
  users[userIndex].contacts.reddit = req.body.reddit;
  users[userIndex].contacts.twitter = req.body.twitter;
  users[userIndex].contacts.youtube = req.body.youtube;
  
  saveJSON(users, 'users.json');
  res.redirect('/users?id='+uinfo.username);
});

//GET to lock a topic.
app.get('/api/locktopic', function(req, res) {
  topicLockManage(req, res, true);
});

//GET to unlock a topic.
app.get('/api/unlocktopic', function(req, res) {
  topicLockManage(req, res, false);
});

//Manage the locking of a topic (toggle on/off).
function topicLockManage(req, res, desiredState) {
  
  //Is the user moderator or above?
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.ismoderator && !uinfo.isadmin) {
    res.redirect('/');
    return;
  }
  
  //Yep, check the board and topic are included.
  if (req.query.board == undefined || req.query.topic == undefined) {
    res.redirect('/?err=A board or topic was not provided%2E');
    return;
  }
  
  //They are, get the board.
  var boardIndex = -1;
  for (var i=0; i<forum.boards.length; i++) {
    if (forum.boards[i].name == req.query.board) {
      boardIndex = i;
      break;
    }
  }
  
  //Check if found.
  if (boardIndex == -1) {
    res.redirect('/?err=Invalid board given%2E');
    return;
  }
  
  //Okay, found, get the topic and lock it.
  var found = false;
  for (var i=0; i<forum.boards[boardIndex].topics.length; i++) {
    if (forum.boards[boardIndex].topics[i].name == req.query.topic) {
      
      if (desiredState) {  
        forum.boards[boardIndex].topics[i].locked = true;
      } else {
        forum.boards[boardIndex].topics[i].locked = false;
      }
      found = true
      
    }
  }
  
  //Check if found.
  if (!found) {
    res.redirect('/?err=Invalid topic given%2E');
    return;
  }
  
  //Save forum JSON and redirect.
  saveJSON(forum, 'forum.json');
  res.redirect('/boards');
}

//GET to lock a post.
app.get('/api/lockpost', function(req, res) {
  postLockManage(req, res, true);
});

//GET to unlock a post.
app.get('/api/unlockpost', function(req, res) {
  postLockManage(req, res, false);
});

function postLockManage(req, res, desiredState) {
  
  //Is the user moderator or above?
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.ismoderator && !uinfo.isadmin) {
    res.redirect('/');
    return;
  }
  
  //Check ID is in query.
  if (req.query.id == undefined) {
    res.redirect('/boards?err=No ID provided%2E');
    return;
  }
  
  //Get the post. Does it exist?
  if (!fs.existsSync('posts/' + req.query.id + '.json')) {
    //No.
    res.redirect('/boards?err=Invalid%20post%20ID%20given%2E');
    return;
  }

  //Yep, load the post.
  var post = loadJSON('posts/' + req.query.id + ".json");
  
  //Toggle according to desired state.
  if (desiredState) {
    post.locked = true;
  } else {
    post.locked = false;
  }
  
  //Save.
  saveJSON(post, 'posts/' + req.query.id + ".json");
  
  //Redirect.
  res.redirect('/boards');
}

//POST route for creating a badge.
app.post('/api/createbadge', function(req, res) {

  //Is the user admin?
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.isadmin) {
    res.redirect('/');
    return;
  }
  
  //Check the parameters are there.
  if (req.body.badgename == undefined || req.body.badgeimage == undefined || req.body.badgedesc==undefined) {
    res.redirect('/admin?err=Missing badge name or image or description%2E');
  }
  
  //Yes, create the badge.
  forum.badges.push({
    name: req.body.badgename,
    image: req.body.badgeimage,
    description: req.body.badgedesc
  });
  
  //Saving JSON.
  saveJSON(forum, 'forum.json');
  
  //Back to admin panel.
  res.redirect('/admin');
});

//GET route for deleting a badge.
app.get('/api/deletebadge', function(req, res) {

  //Is the user admin?
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.isadmin) {
    res.redirect('/');
    return;
  }
  
  //Check a name query is provided.
  if (req.query.name == undefined) {
    res.redirect('/admin?err=No name provided to delete%2E');
    return;
  }
  
  //Find and delete this badge.
  var found = false;
  for (var i=0; i<forum.badges.length; i++) {
    if (forum.badges[i].name == req.query.name) {
      forum.badges.splice(i, 1);
      found = true;
      break;
    }
  }
  
  if (!found) {
    res.redirect('/admin?err=Could not find badge with that name%2E');
    return;
  }
  
  //Save forum JSON.
  saveJSON(forum, 'forum.json');
  
  //Redirect back to panel.
  res.redirect('/admin');
});

//POST route for editing a badge.
app.post('/api/editbadge', function(req, res) {
  
  //Is the user admin?
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.isadmin) {
    res.redirect('/');
    return;
  }
  
  //Check a name query is provided.
  if (req.query.name == undefined) {
    res.redirect('/admin?err=No name provided to delete%2E');
    return;
  }
  
  //Checking the body parameters are valid.
  if (req.body.badgename == undefined || req.body.badgedesc == undefined || req.body.badgeimage == undefined) {
    res.redirect('/admin?err=Invalid POST parameters passed%2E');
    return;
  }
  
  //Checking the new badge name doesn't clash with any other badges.
  for (var i=0; i<forum.badges.length; i++) {
    if (forum.badges[i].name == req.body.badgename && forum.badges[i].name != req.query.name) {
      res.redirect('/admin/editbadge?name='+req.query.name+'&err=Two badges cannot have the same name%2E');
      return;
    }
  }
  
  //Save to badge.
  var found = false;
  for (var i=0; i<forum.badges.length; i++) {
    if (forum.badges[i].name == req.query.name) {

      //Found, save.
      forum.badges[i].name = req.body.badgename;
      forum.badges[i].description = req.body.badgedesc;
      forum.badges[i].image = req.body.badgeimage;
      found = true;
      
    }
  }
  
  //Check it was found.
  if (!found) {
    res.redirect('/admin/editbadge?name='+req.query.name+'&err=Could not find badge to edit%2E');
    return;
  }
  
  //Save JSON and redirect.
  saveJSON(forum, 'forum.json');
  res.redirect('/admin');
});

//POST route for managing a user's badges.
app.post('/api/managebadges', function(req, res) {
  
  //Is the user admin?
  var uinfo = getPageUserInfo(req.cookies.userSession);
  if (!uinfo.isadmin) {
    res.redirect('/');
    return;
  }
  
  //Check a name query is provided.
  if (req.query.user == undefined) {
    res.redirect('/admin?err=No name provided to manage badges for%2E');
    return;
  }
  
  //Checking the body parameters are valid.
  if (req.body.badgelist == undefined) {
    res.redirect('/admin?err=Invalid POST parameters passed%2E');
    return;
  }
  
  //Splitting badge list by comma.
  var badgelist = req.body.badgelist.split(',');
  
  //Checking each badge exists.
  if (badgelist.length>0 && badgelist[0]!=""){
    for (var i=0; i<badgelist.length; i++) {

      //Attempt to match.
      var found = false;
      for (var j=0; j<forum.badges.length; j++) {
        if (badgelist[i] == forum.badges[j].name) {
          found = true;
          break;
        }
      }

      //Check if matched.
      if (!found) {
        res.redirect('/admin/managebadges?user='+req.query.user+'&err=No badge with name %22'+badgelist[i]+'%22 exists%2E');
        return;
      }
    }
  }
  
  //Badges exist, now get the user.
  var userIndex = -1;
  for (var i=0; i<users.length; i++) {
    if (users[i].username == req.query.user) {
      userIndex = i;
      break;
    }
  }
  
  //Check if found.
  if (userIndex==-1){
    res.redirect('/admin?err=User could not be found to modify badges%2E');
    return;
  }
  
  //Modify the user's badges.
  if (badgelist.length==1 && badgelist[0]=="") {
    badgelist = [];
  }
  users[userIndex].badges = badgelist;
  
  //Save JSON, redirect.
  saveJSON(users, 'users.json');
  res.redirect('/directory');
});


//500, internal server error route.
app.get('/500', function(req, res) {
  res.render('500');
});

//404.
app.get('*', function(req, res) { 
  //Render a generic 404. Randomised message, wahoo!
  res.render('404',
  {
    tab_title: config.name + " - 404",
    message: selectRandomErrorMessage()
  });
});

//////////////////

// Listen for requests :)
const listener = app.listen(process.env.PORT, function() {
  console.log('Your app is listening on port ' + listener.address().port);
});

/////////////////////////
/// UTILITY FUNCTIONS ///
/////////////////////////

//Selects a random error message to display.
function selectRandomErrorMessage() {
  return config.error_messages[Math.floor(Math.random()*config.error_messages.length)];
}

//Generates a random string given a character set.
function randomString(length, chars) {
    var result = '';
    for (var i = length; i > 0; --i) result += chars[Math.floor(Math.random() * chars.length)];
    return result;
}

//Generates a random alphanumeric string.
function randomAlphaNumString(length) {
  return randomString(length, '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ');
}

//Saves a given object to file as JSON.
function saveJSON(object, filePath) {
  fs.writeFile(filePath, JSON.stringify(object), function(err) {
    if (err) {
        return false;
    }
    return true;
  });
}

//Loads a given object from JSON file.
//MAKE THIS NON-BLOCKING LATER!
function loadJSON(filePath) {
  var data = fs.readFileSync(filePath);
  return JSON.parse(data);
}

//Returns a user (or null if not found) given a token.
function getUserFromToken(token) {
  var user = "";
  for (var i=0; i<tokens.length; i++) {
    if (tokens[i].token == token) {
      //Found the user.
      user = tokens[i].user;
    }
  }
  
  //Verify someone was found.
  if (user == "") {return null;}
  
  //Found the username, get their user object.
  for (var i=0; i<users.length; i++) {
    if (users[i].username == user) {
      return users[i];
    }
  }
  
  //Couldn't find user object, null.
  return null;
}

//Returns a user given a name.
function getUserFromName(name) {
  for (var i=0; i<users.length; i++) {
    if (users[i].username == name) {
      return users[i];
    }
  }
  
  return null;
}

//Returns the relevant page info for a given user.
function getPageUserInfo(cookie) {
  //Is the user logged in?
  var loggedIn = false;
  var username = "";
  var adminPanel = false;
  var mod = false;
  
  if (cookie != undefined && cookie != null) {
    //Yes, are they an admin? Get their user object.
    loggedIn = true;
    var user = getUserFromToken(cookie.token);
    if (user!= null) {
      username = user.username;
      adminPanel = user.admin;
      mod = user.moderator;
    } else {
      loggedIn = false;
    }
  }
  
  return {
    loggedin: loggedIn,
    username: username,
    isadmin: adminPanel,
    ismoderator: mod
  };
}

//Verifies a recaptcha request.
function verifyRecaptcha(key, callback) {
        https.get("https://www.google.com/recaptcha/api/siteverify?secret=" + config.RECAPTCHA_SECRET + "&response=" + key, function(res) {
                var data = "";
                res.on('data', function (chunk) {
                        data += chunk.toString();
                });
                res.on('end', function() {
                        try {
                                var parsedData = JSON.parse(data);
                                callback(parsedData);
                        } catch (e) {
                                console.log(e);
                                callback(false);
                        }
                });
        });
}

//Checks whether a string is alphanumeric.
function isAlphaNumeric(str) {
  var code, i, len;

  for (i = 0, len = str.length; i < len; i++) {
    code = str.charCodeAt(i);
    if (!(code > 47 && code < 58) && // numeric (0-9)
        !(code > 64 && code < 91) && // upper alpha (A-Z)
        !(code > 96 && code < 123)) { // lower alpha (a-z)
      return false;
    }
  }
  return true;
}

//Checks if a URL is a picture (by extension).
function isPicture(url) {
  try {
    return(url.match(/\.(jpeg|jpg|gif|png)$/) != null);
  } catch(e) {
    return false;
  }
}