const express = require('express')
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');
const passwordHash = require('password-hash');
const session = require('express-session');
var serviceAccount = require("./Key.json");
const multer = require('multer');
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

app.get('/', (req, res) => {
  res.send('Welcome Here!');
})

app.get('/login', (req, res) => {
  res.sendFile(__dirname + '/public/login.html');
});

app.get('/signup', (req, res) => {
  res.sendFile(__dirname + '/public/signup.html');
});

app.get('/request-form', (req, res) => {
  res.sendFile(__dirname + '/public/request_form.html');
})

// app.post('/signup', async (req, res) => {
//   const email = req.body.Email;
//   const name = req.body.Name;

//   // If the user with the provided Name already exists
//   const existingUser = await db.collection('Users').doc(email).get();

//   if (existingUser.exists) {
//     // User already exists, redirect to the login page
//     res.send("User already exists, redirect to the login page");
//   } else {
//     // User is not registered, it will create a new document with Name as the document ID
//     const userDef = {
//       Name: name,
//       Email: email,
//       Password: passwordHash.generate(req.body.Password),
//       Department: req.body.Department,
//       Role: req.body.Role
//     }
//     if(req.body.Role!=="HOD"){
//       userDef.Regd_No = req.body.regd_no;
//     }
//     await db.collection('Users').collection(req.body.Department).doc(email).set(userDef).then(() => {
//       // Send a success message and then redirect to the login page
//       res.send("Signup Successful");
//     });
//   }
// });

app.post('/signup', async (req, res) => {
  const email = req.body.Email;
  const name = req.body.Name;
  const department = req.body.Department;

  // If the user with the provided Name already exists
  const existingUser = await db.collection('Users').doc(email).get();

  if (existingUser.exists) {
    // User already exists, redirect to the login page
    res.send("User already exists, redirect to the login page");
  } else {
    // User is not registered, create a new document in the department subcollection
    const userDef = {
      Name: name,
      Email: email,
      Password: passwordHash.generate(req.body.Password),
      Role: req.body.Role
    };

    // Conditionally add Regd_No based on the user's role
    if (req.body.Role !== "HOD") {
      userDef.Regd_No = req.body.regd_no;
    }

    // Add the user document to the appropriate department subcollection
    await db.collection('Users').doc(department).collection(department).doc(email).set(userDef);

    // Send a success message and then redirect to the login page
    res.send("Signup Successful");
  }
});

app.post('/login', async (req, res) => {
  const email = req.body.Email;

  // Check if the user document exists in the specific department
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
      // Sends a success alert message and then redirect or perform any other actions
      res.send("Success!!");
    } else {
      res.send("Credentials Wrong!!");
    }
  } else {
    // User not found, sends an alert or error message
    res.send("User Not Found");
  }
});


// Sample department-to-HOD mapping
const departmentToHODMapping = {
  CSE: 'rsraju@vishnu.edu.in',
  ECE: 'hod-ece@vishnu.edu.in',
  // Add more departments and corresponding HOD emails as needed
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

    const userDocument = await db.collection('Users').doc(department).collection(department).doc(studentEmail);
    const userDef = await userDocument.get()
    const imagepath = '/uploads/' + imageFile.filename;
    let requestData;
    if (to_date == from_date){
      requestData = {
          regd_no:regd_no,
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
          reason:reason,
          from_date:from_date,
          to_date:to_date,
          imgPath: imagepath,
          status: 'Pending'
        }
      }

    // Update the student's requests in their own document
    const studentRequestsRef = userDocument.collection('requests');
    studentRequestsRef.add(requestData);

    // Retrieve the HOD email from the mapping
    const hodEmail = departmentToHODMapping[department];

    if (hodEmail) {
      // Duplicate the request data to the HOD's document
      const hodDocumentRef = db.collection('Users').doc(department).collection(department).doc(hodEmail);
      const hodRequestsRef = hodDocumentRef.collection('requests');
      hodRequestsRef.add(requestData);
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
    
    // Retrieve the requests for the HOD's department
    const requestsRef = db.collection('Users').doc(department).collection(department);

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

    // Update the request status based on the action
    const requestsRef = db.collection('Users').doc(department).collection(department);
    const requestDoc = requestsRef.doc(requestId);

    if (action === 'approve') {
      await requestDoc.update({ status: 'approved' });
    } else if (action === 'deny') {
      await requestDoc.update({ status: 'denied' });
    }

    // Redirect back to the HOD requests page
    res.redirect('/hod-requests');
  } else {
    res.send('<script>alert("Please Login as HOD."); window.location.href = "/login";</script>');
  }
});

app.listen(port, () => {
  console.log(`App listening on port http://localhost:${port}`);
})