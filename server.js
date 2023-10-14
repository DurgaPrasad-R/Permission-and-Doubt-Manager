const express = require('express')
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');
const passwordHash = require('password-hash');
const session = require('express-session');
var serviceAccount = require("./Key.json");
const multer = require('multer');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const app = express()
const port = 3000

app.use(express.json());
app.use(express.urlencoded());

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

app.use(express.static("public"));
app.set('view engine', 'ejs');
const db = getFirestore();

app.use(session({
  secret: 'qwertypj',
  resave: false,
  saveUninitialized: true,
}));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads'); 
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  },
});
const upload = multer({ storage: storage });

app.get('/dashboard', (req, res) => {
  res.send('Hurray! Welcome Gig!!');
})

app.get('/login', (req, res) => {
  res.render('login',{flag: false});
});

app.get('/signup', (req, res) => {
  res.sendFile(__dirname + '/public/signup.html');
});

app.get('/request-form', (req, res) => {
  res.sendFile(__dirname + '/public/request_form.html');
});

app.get('/forgot-password', (req,res) => {
  res.render('forgot')
});

app.post('/forgot-password', (req,res) => {
  const code =  crypto.randomBytes(3).toString('hex').toUpperCase().substring(0, 6);
  const user_email = req.body.Email;
  const dept = req.body.Department;
  credential = {
    user_email: user_email,
    user_dept: dept
  }
  req.session.credentials = credential;
  const session = req.session;
  res.render('reset',{code,session: session});
})

app.post('/signup', async (req, res) => {
  const email = req.body.Email;
  const name = req.body.Name;
  const department = req.body.Department;

  // If the user with the provided Name already exists redirect to the login page
  const existingUser = await db.collection('Users').doc(department).collection(department).doc(email).get();

  if (existingUser.exists) {
    res.send("User already exists, redirect to the login page");
  } else {
    // New User
    const userDef = {
      Name: name,
      Email: email,
      Password: passwordHash.generate(req.body.Password),
      Role: req.body.Role
    };

    // add Regd_No based on the user's role
    if (req.body.Role !== "HOD" || req.body.Role != "Faculty") {
      userDef.Regd_No = req.body.regd_no;
    }

    await db.collection('Users').doc(department).collection(department).doc(email).set(userDef);

    res.send("Signup Successful");
  }
});

app.post('/login', async (req, res) => {
  const email = req.body.Email;

  // if the user document exists in the specific department then he should be logged in
  const department = req.body.Department;
  const querySnapshot = await db.collection('Users').doc(department).collection(department).doc(email).get();

  if (querySnapshot.exists) {
    const docData = querySnapshot.data();
    const PasswordHash = docData.Password;

    if (passwordHash.verify(req.body.Password, PasswordHash)) {
      const userData = {
        Useremail: email,
        Department: department,
        Role: docData.Role
      };
      req.session.userData = userData;
      res.send("Success!!");
    } else {
      res.render('login', {message: 'The Password doesnot match',flag:true});
    }
  } else {
    res.render('login', {message: 'Given Details are not found. Please Signup',flag:true});
  }
});

app.post('/reset-password', async (req,res) => {
  const userEmail = req.session.credentials.user_email;
  const department = req.session.credentials.user_dept;
  const newPassword = req.body.Pass;
  const verificationCode = req.body.Code1 + req.body.Code2 + req.body.Code3 + req.body.Code4 + req.body.Code5 + req.body.Code6;
  const originalCode = req.body.original_code;

  const userRef = await db.collection('Users').doc(department).collection(department).doc(userEmail);
  const userSnapshot = await userRef.get();
  if (userSnapshot.empty) {
    // User not found, handle accordingly
    return res.send('User not found');
  } else{
    if (req.body.Confirm_Pass !== req.body.Pass){
      res.send("Passwords don't match");
    }
    else if (verificationCode === originalCode && req.body.Confirm_Pass === req.body.Pass ){
      await userRef.update({ Password: passwordHash.generate(newPassword) });
      res.send("Password Reset Successfully");
    } else {
      res.send('Invalid verification code');
    }
  }

})

const departmentToHODMapping = {
  CSE: 'rsraju@vishnu.edu.in',
  ECE: 'hod-ece@vishnu.edu.in',
  // TODO: Add more departments and corresponding HOD emails as needed
};

app.post('/request-form-data-upload', upload.single('documents'), async (req, res) => {
  if (req.session.userData) {
    const studentEmail = req.session.userData.Useremail;
    const department = req.session.userData.Department;

    const reason = req.body.reason;
    const from_date = req.body.from_date;
    const to_date = req.body.to_date;
    const from_time = req.body.from_time;
    const to_time = req.body.to_time;

    const imageFile = req.file;
    if (!imageFile) {
      return res.status(400).send('No file uploaded.');
    }
    const uniqueId = uuidv4();
    const userDocument = await db.collection('Users').doc(department).collection(department).doc(studentEmail);
    const userDef = await userDocument.get()
    const imagepath = '/uploads/' + imageFile.filename;
    let requestData;
    if (to_date == from_date){
      requestData = {
          id: uniqueId,
          regd_no:studentEmail.substring(0, 10),
          reason:reason,
          from_date:from_date,
          to_date:to_date,
          from_time:from_time,
          to_time:to_time,
          imgPath: imagepath,
          status: 'Pending'
        }
      }
      else{
        requestData = {
          id: uniqueId,
          regd_no:studentEmail.substring(0, 10),
          reason:reason,
          from_date:from_date,
          to_date:to_date,
          imgPath: imagepath,
          status: 'Pending'
        }
      }

    // Update the student's requests and also add it to the HOD's requests
    const studentRequestsRef = userDocument.collection('requests');
    studentRequestsRef.doc(uniqueId).set(requestData);

    // Retrieving the HOD email from the mapping
    const hodEmail = departmentToHODMapping[department];

    if (hodEmail) {
      const hodDocumentRef = db.collection('Users').doc(department).collection(department).doc(hodEmail);
      const hodRequestsRef = hodDocumentRef.collection('requests');
      hodRequestsRef.doc(uniqueId).set(requestData);
    }

    res.send('Success');
  } else {
    res.send('<script>alert("Please Login."); window.location.href = "/login";</script>');
  }
});

app.get('/student-requests', async (req, res) => {
  if (req.session.userData && req.session.userData.Role === 'Student') {
    const studentEmail = req.session.userData.Useremail;
    const department = req.session.userData.Department;

    // Retrieve the student's requests from the database
    const studentRequestsRef = db.collection('Users').doc(department).collection(department).doc(studentEmail).collection('requests');
    const studentRequestsSnapshot = await studentRequestsRef.get();

    const studentRequests = [];

    studentRequestsSnapshot.forEach((doc) => {
      const requestData = doc.data();
      studentRequests.push({ id: doc.id, ...requestData });
    });

    res.render('student_requests', { requests: studentRequests });
  } else {
    res.send('<script>alert("Please Login."); window.location.href = "/login";</script>');
  }
});

app.get('/hod-requests', async (req, res) => {
  if (req.session.userData && req.session.userData.Role === 'HOD') {
    const department = req.session.userData.Department;
    const hodmail = departmentToHODMapping[department];
    // Retrieve the requests for the HOD's department
    const requestsRef = db.collection('Users').doc(department).collection(department).doc(hodmail).collection('requests');
    
    const snapshot = await requestsRef.get();

    const requests = [];
    snapshot.forEach((doc) => {
      requests.push({ id: doc.id, ...doc.data() });
    });

    res.render('hod_requests', { requests });
  } else {
    res.send('<script>alert("Please Login as HOD."); window.location.href = "/login";</script>');
  }
});

app.post('/hod-requests/approve', async (req, res) => {
  if (req.session.userData && req.session.userData.Role === 'HOD') {
    const department = req.session.userData.Department;
    const requestId = req.body.requestId;
    const action = req.body.action; // "approve" or "deny"
    const hodmail = departmentToHODMapping[department]
    // Update the request status based on the action
    const requestsRef = db.collection('Users').doc(department).collection(department).doc(hodmail).collection('requests');
    const requestDoc = requestsRef.doc(requestId);
    const studentEmail = req.body.regd_no+"@vishnu.edu.in";
    const StudentrequestsRef = db.collection('Users').doc(department).collection(department).doc(studentEmail).collection('requests');
    const student = StudentrequestsRef.doc(requestId);
    if (action === 'approve') {
      await requestDoc.update({ status: 'Approved' });
      await student.update({status: 'Approved'})
    } else if (action === 'deny') {
      await requestDoc.update({ status: 'Denied' });
      await student.update({status: 'Denied'})
    }

    // Redirect back to the HOD requests page
    res.redirect('/hod-requests');
  } else {
    res.send('<script>alert("Please Login as HOD."); window.location.href = "/login";</script>');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    } else {
      res.redirect('/dashboard');
    }
  });
});

app.listen(port, () => {
  console.log(`App listening on port http://localhost:${port}`);
})