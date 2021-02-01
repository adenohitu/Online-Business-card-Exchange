const express = require('express');
const router = express.Router();
//login module setup
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const session = require('express-session');
const flash = require('connect-flash');
const LineStrategy = require('../node_modules/passport-line/lib');

const multer = require('multer');
const upload = multer({
  dest: './public/images/uploads/',
});

const mysql = require('mysql');

var LINE_CHANNEL_ID = '';
var LINE_CHANNEL_SECRET = '';

const pool = mysql.createPool({
  connectionLimit: 10,
  host: 'mysql',
  user: 'node',
  password: '',
  database: 'node_db'
});

router.use(flash());
router.use(session({
  secret: 'teteetetets',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: true, maxAge: 43200000 }
}));
router.use(passport.initialize());

router.use(passport.session());
passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (user, done) {
  done(null, user);
});


passport.use(new LocalStrategy(function (username, password, done) {
  //クエリ
  pool.getConnection(function (err, connection) {
    connection.query('SELECT * FROM `user_login` WHERE `email` = ?', [username], function (error, results, fields) {
      //console.log(results);
      // ここで username と password を確認して結果を返す
      if (error) { return done(error); }
      if (results[0] == undefined) {
        return done(error);
      }
      if (password !== results[0].password) {
        return done(null, false, { message: 'パスワードが正しくありません。' });
      }
      return done(null, results[0].user_id);
      connection.release();
    })
  });
}));
//line authのための設定
passport.use(new LineStrategy({
  channelID: LINE_CHANNEL_ID,
  channelSecret: LINE_CHANNEL_SECRET,
  callbackURL: 'URL',
},
  function (accessToken, refreshToken, profile, done) {
    pool.getConnection(function (err, connection) {
      connection.query('SELECT * FROM `users` WHERE `line_userid` = ?', [profile.id], function (error, results) {
        //console.log(profile.displayName);
        // ここで username と password を確認して結果を返す
        if (error) { return done(error); }
        if (results[0] == undefined) {
          //データのチェックができないため新規登録とする
          connection.query("insert into users set ?", { line_userid: profile.id }, function (error) {
            if (error) { return done(error); }
          });
          connection.query('SELECT * FROM `users` WHERE `line_userid` = ?', [profile.id], function (error, results) {
            //console.log(error);
            connection.query("insert into line_data set ?", {
              id: results[0].user_id,
              displayName: profile.displayName,
              pictureUrl: profile.pictureUrl,
              statusMessage: profile.statusMessage
            }, function (error) {
              if (error) { return done(error); }
            });
            return done(null, results[0].user_id,);
          });
        } else {
          connection.query("UPDATE `line_data` set ? WHERE `id` = '?'", [{
            id: results[0].user_id,
            displayName: profile.displayName,
            pictureUrl: profile.pictureUrl,
            statusMessage: profile.statusMessage
          }, results[0].user_id], function
            (error, results, fields) {
          });
          return done(null, results[0].user_id);
        }

      })
      connection.release();
    });
  }
));

//ログイン状態のチェック
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {  // 認証済
    return next();
  }
  else {  // 認証されていない
    res.redirect(`/login?origin=${req.originalUrl}`)
    //res.redirect('/login');  // ログイン画面に遷移
  }
}
//ログインされているときログイン画面に入らないようにするための関数
function isUnauthenticated(req, res, next) {
  if (req.isUnauthenticated()) {  // 認証されていないなら
    return next();
  }
  else {  // 認証されている
    res.redirect('/');  // ログイン後のホーム画面へ
  }
}

router.get('/', function (req, res, next) {
  if (req.isAuthenticated() == true) {
    res.render('index', { login: 'ログアウト', url: '/logout' });
  } else {
    res.render('index', { login: 'ログイン・新規登録', url: '/login' });
  }
});

router.get("/login", isUnauthenticated, (req, res) => {
  if (req.query.origin) {
    req.session.returnTo = req.query.origin
  } else {
    req.session.returnTo = req.header('Referer')
  }
  res.render("login");
});
router.get("/registration", isAuthenticated, (req, res) => {
  //登録状態のチェック
  pool.getConnection(function (err, connection) {
    connection.query('SELECT * FROM `users_info` WHERE `user_id` = ?', [req.user], function
      (error, results, fields) {
      connection.release();
      if (results[0] == undefined) {
        //データのチェックができないため新規登録とする
        res.render("registration");
      } else {
        res.redirect('/change');
      }
      //console.log(results);
      //console.log(error);
      //console.log(fields);
    });
  })
});

router.post('/registration', isAuthenticated, function (req, res, next) {
  //console.log(req.body);
  pool.getConnection(function (err, connection) {
    connection.query("INSERT INTO `users_info` set ?", {
      user_id: req.user,
      name_last: req.body.name_last,
      name_last_en: req.body.name_last_en,
      name_first: req.body.name_first,
      name_first_en: req.body.name_first_en,
      nickname: req.body.nickname,
      Belongs: req.body.Belongs,
      MailAddress: req.body.MailAddress,
      Twitter: req.body.Twitter,
      Instagram: req.body.Instagram,
      comment: req.body.comment
    }, function
      (error, results, fields) {
      connection.release();
      //console.log(results);
      //console.log(error);
      //console.log(fields);
      res.redirect('/user?userid=' + req.user);
    });
  })
});
//画像のアップロード
//router.post('/imgup', upload.single('image_file'), function (req, res, next) {
//console.log(req.body);
//  console.log(req.file);
//  res.redirect('/imgup');
//});
//router.get("/imgup", (req, res) => {
//  res.render('imgup');
//});


router.get("/change", isAuthenticated, (req, res) => {
  pool.getConnection(function (err, connection) {
    connection.query('SELECT * FROM `users_info` WHERE `user_id` = ?', [req.user], function
      (error, results, fields) {
      connection.release();
      if (results[0] != undefined) {
        //console.log(results[0]);
        //データがあるため変更とする
        //登録してあるデータの確認
        res.render("change", {
          user_id: req.user,
          name_last: results[0].name_last,
          name_last_en: results[0].name_last_en,
          name_first: results[0].name_first,
          name_first_en: results[0].name_first_en,
          nickname: results[0].nickname,
          Belongs: results[0].Belongs,
          MailAddress: results[0].MailAddress,
          Twitter: results[0].Twitter,
          Instagram: results[0].Instagram,
          comment: results[0].comment
        });
      } else {
        res.redirect('/registration');
      }
      //console.log(results);
      //console.log(error);
      //console.log(fields);
    });
  })
});

router.post('/change', isAuthenticated, function (req, res, next) {
  pool.getConnection(function (err, connection) {
    connection.query("UPDATE `users_info` set ? WHERE `user_id` = '?'", [{
      user_id: req.user,
      name_last: req.body.name_last,
      name_last_en: req.body.name_last_en,
      name_first: req.body.name_first,
      name_first_en: req.body.name_first_en,
      nickname: req.body.nickname,
      Belongs: req.body.Belongs,
      MailAddress: req.body.MailAddress,
      Twitter: req.body.Twitter,
      Instagram: req.body.Instagram,
      comment: req.body.comment
    }, req.user], function
      (error, results, fields) {
      //console.log(results);
      console.log(error);
      //console.log(fields);
      res.redirect('/user?userid=' + req.user);
    });
    connection.release();
  })
});

router.get("/user", isAuthenticated, (req, res) => {
  pool.getConnection(function (err, connection) {
    connection.query('SELECT * FROM `users_info`INNER JOIN `line_data`ON users_info.user_id = line_data.id WHERE `user_id` = ?', [req.query.userid], function
      (error, results1, fields) {
      //console.log(results1[0]);
      if (results1[0] == undefined) {
        //ユーザーのデータがないためエラーを出す
        res.render("usererror");
      } else {
        //認証されているかの確認
        connection.query('SELECT * FROM `follow` WHERE `user_id` = ? AND `follow_id` = ?', [req.user, req.query.userid], function
          (error, results, fields) {
          if (req.user != req.query.userid && results[0] == undefined) {
            //認証データがないため認証申請画面に飛ばす。
            res.redirect('/approval?follow_id=' + req.query.userid);
          } else if (req.user == req.query.userid || results[0].status == 1) {
            res.render("user", {
              name_last: results1[0].name_last,
              name_last_en: results1[0].name_last_en,
              name_first: results1[0].name_first,
              name_first_en: results1[0].name_first_en,
              nickname: results1[0].nickname,
              Belongs: results1[0].Belongs,
              MailAddress: results1[0].MailAddress,
              Twitter: results1[0].Twitter,
              Instagram: results1[0].Instagram,
              comment: results1[0].comment,
              pictureUrl: results1[0].pictureUrl,
              displayName: results1[0].displayName
            });
          } else if (results[0].status == 0) {
            res.render("userwait");
          }
        })
        //データ表示
        //console.log(results[0]);
      }
      //console.log(results);
      //console.log(error);
      //console.log(fields);
    });
    connection.release();
  });
})
//console.log(error);
//console.log(fields);


router.get("/approval", isAuthenticated, (req, res) => {
  pool.getConnection(function (err, connection) {
    connection.query('SELECT * FROM `follow` WHERE `user_id` = ? AND `follow_id` = ?', [req.user, req.query.follow_id], function
      (error, results, fields) {
      if (results[0] == undefined) {
        //認証要求するか聞くやつ
        connection.query('SELECT * FROM `line_data` WHERE `id` = ?', [req.query.follow_id], function
          (error, results, fields) {
          //console.log(results);
          res.render("approval", {
            follow_id: req.query.follow_id,
            displayName: results[0].displayName,
            Url: results[0].pictureUrl
          });
        });

      } else {
        res.redirect('/user?user_id=' + req.query.follow_id);
      }
      //console.log(results);
      //console.log(error);
      //console.log(fields);
    });
    connection.release();
  });
});

router.post("/approval", isAuthenticated, (req, res) => {
  pool.getConnection(function (err, connection) {
    connection.query('SELECT * FROM `follow` WHERE `user_id` = ? AND `follow_id` = ?', [req.user, req.query.follow_id], function
      (error, results, fields) {
      if (results[0] == undefined) {
        //認証要求するか聞くやつ
        connection.query("INSERT INTO `follow` set ?", {
          status: 0,
          user_id: req.user,
          follow_id: req.query.follow_id
        }, function
          (error, results, fields) {
          //console.log(results);
          res.render("approval_post", {
            message: "認証リクエストを送信しました"
          });
        });

      } else {
        res.render("approval_post", {
          message: "認証リクエストがすでに送られている、または承認待ちです"
        });
      }
      //console.log(results);
      //console.log(error);
      //console.log(fields);
    });
    connection.release();
  });
});
router.get("/list", isAuthenticated, (req, res) => {
  pool.getConnection(function (err, connection) {
    if (req.query.status == 1 || req.query.status == undefined) {
      connection.query('SELECT * FROM `follow` INNER JOIN line_data ON follow.follow_id = line_data.id WHERE `user_id` = ? AND `status`=?', [req.user, 1], function
        (error, results, fields) {
        //console.log(results);
        res.render('list', { items: results, message: "もらった名刺一覧" });
      });
    }
    connection.release();
  });
});

router.get("/list/approval", isAuthenticated, (req, res) => {
  pool.getConnection(function (err, connection) {
    if (req.query.status == 1 || req.query.status == undefined) {
      connection.query('SELECT * FROM `follow` INNER JOIN line_data ON follow.follow_id = line_data.id WHERE `user_id` = ? AND `status`=?', [req.user, 0], function
        (error, results, fields) {
        //console.log(results);
        res.render('list_approval', { items: results, message: "承認待ち一覧" });
      });
    }
    connection.release();
  });
});

router.get("/list/check", isAuthenticated, (req, res) => {
  pool.getConnection(function (err, connection) {
    connection.query('SELECT * FROM `follow` INNER JOIN line_data ON follow.follow_id = line_data.id WHERE `follow_id` = ? AND `status`=?', [req.user, 0], function
      (error, results, fields) {
      res.render('check', { items: results, message: "承認画面" });
    });
    connection.release();
  });
});

router.post("/list/check", isAuthenticated, (req, res) => {
  //console.log(req.body.ids);
  pool.getConnection(function (err, connection) {
    connection.query("UPDATE `follow` SET `status` = '1' WHERE `ids` =?", [req.body.ids], function
      (error, results, fields) {
      connection.query("SELECT * FROM `follow` WHERE `ids` =?", [req.body.ids], function
        (error, results, fields) {
        //console.log(results);
        connection.query("INSERT INTO `follow` set ?", {
          status: 1,
          user_id: results[0].follow_id,
          follow_id: results[0].user_id
        }, function
          (error, results, fields) {
        });
      });

      res.redirect('/list/check');
    });
    connection.release();
  });
});

router.get("/usermine", isAuthenticated, (req, res) => {
  pool.getConnection(function (err, connection) {
    connection.query('SELECT * FROM `users_info` WHERE `user_id` = ?', [req.user], function
      (error, results, fields) {
      connection.release();
      if (results[0] == undefined) {
        //データのチェックができないため新規登録とする
        res.redirect('/registration');
      } else {
        res.redirect('/user?userid=' + req.user);
      }
      //console.log(results);
      //console.log(error);
      //console.log(fields);
    });
  })


});
// ログイン 【LINE】認証
router.post('/auth/line', passport.authenticate('line'));
// ログイン 【LINE】処理 成功なら/へだめならloginへ
router.get('/auth/line/callback', passport.authenticate('line', { failureRedirect: '/login' }),
  function (req, res) {
    // ログイン成功
    let returnTo = '/'
    if (req.session.returnTo) {
      returnTo = req.session.returnTo
      delete req.session.returnTo
    }
    res.redirect(returnTo);
  }
);

router.post('/login',
  passport.authenticate('local', {
    failureRedirect: '/login',  // 失敗したときの遷移先
    successRedirect: '/usermine',  // 成功したときの遷移先
    failureFlash: true
  }),
);

router.get('/logout', function (req, res) {
  req.logout();
  res.redirect('/');
});


router.get("/send", isAuthenticated, (req, res) => {
  pool.getConnection(function (err, connection) {
    connection.query('SELECT * FROM `users_info` WHERE `user_id` = ?', [req.user], function
      (error, results1, fields) {
      res.render("send", {
        id: req.user,
        name_last: results1[0].name_last,
        name_last_en: results1[0].name_last_en,
        name_first: results1[0].name_first,
        name_first_en: results1[0].name_first_en,
        nickname: results1[0].nickname,
        Belongs: results1[0].Belongs,
        MailAddress: results1[0].MailAddress,
        Twitter: results1[0].Twitter,
        Instagram: results1[0].Instagram,
        comment: results1[0].comment
      });
    })
    //データ表示
    //console.log(results[0]);
    //console.log(results);
    //console.log(error);
    //console.log(fields);
    connection.release();
  });

});

module.exports = router;
