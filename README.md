![Chatot Logo](small_logo.png)

![](https://img.shields.io/badge/version-v1-orange.svg)
![](https://img.shields.io/badge/dependencies-8-green.svg)
![](https://img.shields.io/badge/license-MIT-blue.svg)

ChatOnThis, a compact and easy to set up forum framework, written in Node.
([Demo](http://chatot.glitch.me/))

## Setup
Clone the repository, and open up `config.json`. There, you can configure the following values to fit the forum you want:
```
//The name of the forum.
"name": "Example",

//The title text/image of the forum.
//If your title starts with "http", it will be assumed as an image.
"title": "Example",

//Randomly selected error messages for 404 and 500 screens.
"error_messages": 
[
  "this isn't going too great.",
  "sorry, we can't find anything here.",
  "tumbleweed and dusty rocks here.",
  "i don't think there's anything left."
],

//Support contact information.
"support_discord": "",
"support_email": "",

//The title text and body of the front page "Welcome" block.
"welcome_header": "Welcome to Example.",
"welcome_body": "Configure your forum in the config .JSON file!",

//Board viewing configuration, colours in CSS format.
"board_posts_per_page": 20,
"board_user_role_colour": "#8e908c",
"board_moderator_role_colour": "#3cb70b",
"board_admin_role_colour": "#b70a2a",

//Defaults for users. A blank string for profile pictures means none.
  "user_description_default": "This user is mysterious.",
  "user_profile_picture_default": "",
  "user_about_default": "This user likes to keep an air of mystery.",

//ReCaptcha V2 details for Captcha.
"RECAPTCHA_SITE_KEY": "",
"RECAPTCHA_SECRET": ""
```

After this, start up your server using `node server.js` and then log in with the default user "admin", with password "admin". You can then create new users and delete the default one once another admin has been created.

Then you're done! All board/topic changes are done through the GUI admin panel.
