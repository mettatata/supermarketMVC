const UserProfileModel = require('../models/userProfile');

const UserProfileController = {
  // GET user by id (renders userProfile view)
  getUserById: function (req, res) {
    const sessionUser = req.session && req.session.user;
    const id = req.params.id || (sessionUser && (sessionUser.id || sessionUser.userid));
    if (!id) {
      req.flash && req.flash('error', 'Missing user id.');
      return res.redirect('/');
    }

    UserProfileModel.getUserById({ userid: id }, function (err, user) {
      if (err) {
        console.error('UserProfileController.getUserById error:', err);
        req.flash && req.flash('error', 'Could not load user.');
        return res.redirect('/');
      }
      if (!user) {
        req.flash && req.flash('error', 'User not found.');
        return res.redirect('/');
      }

      // render the user's profile page (template should expect `user`)
      return res.render('userProfile', { user });
    });
  },

  // POST update email and address for current user
  updateEmailAddress: function (req, res) {
    const sessionUser = req.session && req.session.user;
    if (!sessionUser) {
      req.flash && req.flash('error', 'Please log in to update your profile.');
      return res.redirect('/login');
    }

    const userid = req.body.id || req.params.id || sessionUser.id || sessionUser.userid;
    if (!userid) {
      req.flash && req.flash('error', 'Missing user id.');
      return res.redirect('/userProfile');
    }

    // only allow users to update their own profile unless admin
    const isAdmin = sessionUser && sessionUser.role === 'admin';
    if (!isAdmin && String(userid) !== String(sessionUser.id) && String(userid) !== String(sessionUser.userid)) {
      req.flash && req.flash('error', 'You are not authorized to update this profile.');
      return res.redirect('/userProfile');
    }

    const email = (req.body.email || '').trim();
    const address = (req.body.address || '').trim();
    const contact = (req.body.contact || '').trim();

    if (!email && !address && !contact) {
      req.flash && req.flash('error', 'No changes submitted.');
      return res.redirect('/userProfile');
    }

    const updateParams = { userid };
    if (email) updateParams.email = email;
    if (address) updateParams.address = address;
    if (contact) updateParams.contact = contact;

    UserProfileModel.updateUser(updateParams, function (err, result) {
      if (err) {
        console.error('UserProfileController.updateEmailAddress error:', err);
        req.flash && req.flash('error', 'Unable to update profile. Please try again.');
        return res.redirect('/userProfile');
      }

      req.flash && req.flash('success', 'Profile updated successfully.');
      // refresh session user info if the logged-in user updated their own email
      if (String(userid) === String(sessionUser.id) || String(userid) === String(sessionUser.userid)) {
        // fetch latest data and store minimal session info
        UserProfileModel.getUserById({ userid: userid }, function (err2, freshUser) {
          if (!err2 && freshUser) {
            req.session.user = req.session.user || {};
            req.session.user.email = freshUser.email;
            req.session.user.username = freshUser.username || req.session.user.username;
            req.session.user.address = freshUser.address;
            req.session.user.contact = freshUser.contact;
          }
          return res.redirect('/userProfile');
        });
      } else {
        return res.redirect('/userProfile');
      }
    });
  }
};

module.exports = UserProfileController;
