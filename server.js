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
  const role = req.body.Role;
  const dept = req.body.Department;
  credential = {
    user_email: user_email,
    user_dept: dept,
    user_role: role
  }
  req.session.credentials = credential;
  const session = req.session;
  res.render('reset',{code,session: session});
})

app.post('/signup', async (req, res) => {
  const email = req.body.Email;
  const name = req.body.Name;
  const department = req.body.Department;
  const Role = req.body.Role;

  // If the user with the provided Name already exists redirect to the login page
  const existingUser = await db.collection('Users').doc(department).collection(department).doc(Role).collection(Role).doc(email).get();

  if (existingUser.exists) {
    res.send("User already exists, redirect to the login page");
  } else {
    // New User
    const userDef = {
      Name: name,
      Email: email,
      Password: passwordHash.generate(req.body.Password),
      Role: Role
    };

    // add Regd_No based on the user's role
    if (Role !== "HOD" || Role != "Faculty") {
      userDef.Regd_No = req.body.regd_no.toUpperCase();
    }
    await db.collection('Users').doc(department).collection(department).doc(Role).collection(Role).doc(email).set(userDef);
    res.send("Signup Successful");
  }
});

app.post('/login', async (req, res) => {
  const email = req.body.Email;

  const Role = req.body.Role;
  const department = req.body.Department;
  const querySnapshot = await db.collection('Users').doc(department).collection(department).doc(Role).collection(Role).doc(email).get();

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
      const name = docData.Name;
      const session = req.session;
      if (docData.Role === 'Faculty'){
        res.redirect("/facultymembers"); // ToDo JV Name through session
      }
       else if (docData.Role === 'Student'){
        res.render("studentdashboard",{name: name}); // ToDo JV Name through session
      } 
      // else {
      //   // TODO Dashboard for HOD
      // }
      else{
        res.send("Success");
      }
    } else {
      res.render('login', {message: 'The Password doesnot match',flag:true});
    }
  } else {
    res.render('login', {message: 'Given Details are not found. Please Signup',flag:true});
  }
});

app.get("/facultymembers",(req,res)=>{
  if (req.session.userData) {
    const name = req.session.userData.Useremail;
    queries=[];
    db.collection('Users').doc(req.session.userData.Department).collection(req.session.userData.Department).doc("Faculty").collection("Faculty").doc(req.session.userData.Useremail).collection("doubts").get().then((docs)=>{
      if(docs.size>0){
          docs.forEach((doc)=>{
              queries.push({
                name:doc.data().name,
                sub:doc.data().subject,
                description:doc.data().description,
                id:doc.data().id
              })
          })
        }
      res.render("faculty",{names:queries,name:name});
    })
  }
});

app.post("/queryreply",(req,res)=>{
  if(req.session.userData){
    const fid = req.session.userData.Useremail;
    const department = req.session.userData.Department;
    db.collection('Users').doc(department).collection(department).doc("Student").collection("Student").doc(req.body.name).collection("replies").doc(req.body.id).set({
      id: req.body.id,
      name:req.body.name,
      subject:req.body.sub,
      description:req.body.description,
      response:req.body.response,
      replyfrom:fid,
    })
    db.collection('Users').doc(department).collection(department).doc("Faculty").collection("Faculty").doc(req.session.userData.Useremail).collection("replies").doc(req.body.id).set({
      id: req.body.id,
      name:req.body.name,
      subject:req.body.sub,
      description:req.body.description,
      response:req.body.response,
      replyfrom:fid,
    });
    db.collection('Users').doc(department).collection(department).doc("Student").collection("Student").doc(req.body.name).collection("doubts").doc(req.body.id).delete();
    db.collection('Users').doc(department).collection(department).doc("Faculty").collection("Faculty").doc(req.session.userData.Useremail).collection("doubts").doc(req.body.id).delete();
    res.redirect("/facultymembers");
  } else {
    res.send('<script>alert("Please Login."); window.location.href = "/login";</script>');
  }
})

app.get("/replies",(req,res)=>{
  if (req.session.userData) {
    const dis = [];
    db.collection('Users').doc(req.session.userData.Department).collection(req.session.userData.Department).doc("Faculty").collection("Faculty").doc(req.session.userData.Useremail).collection("replies").get().then((docs)=>{
      if(docs.size>0){
        docs.forEach((doc)=>{
            dis.push({
              name:doc.data().name,
              sub:doc.data().subject,
              description:doc.data().description,
              response:doc.data().response,
              id: doc.data().id
            })
        })
      }
      res.render("replies.ejs",{
        names:dis,
      })
    })
  }else{
    res.redirect('/login');
  }
})

function getFacultyByDepartment(req, res, department) {
  const show = [];
  db.collection('Users').doc(department).collection(department).doc("Faculty").collection("Faculty").get().then((docs) => {
    if (docs.size > 0) {
      docs.forEach((doc) => {
        show.push({
          name: doc.data().Name,
          dept: department,
          email: doc.data().Email
        });
      });
    }
    res.render("show", {
      names: show,
    });
  });
}

app.get("/cse", (req, res) => getFacultyByDepartment(req, res, "CSE"));
app.get("/ece", (req, res) => getFacultyByDepartment(req, res, "ECE"));
app.get("/eee", (req, res) => getFacultyByDepartment(req, res, "EEE"));
app.get("/mech", (req, res) => getFacultyByDepartment(req, res, "ME"));
app.get("/civil", (req, res) => getFacultyByDepartment(req, res, "CE"));

app.post("/faculty",(req,res)=>{
  const faculty_mail = req.body.email;
  res.render("student_doubt",{faculty_mail:faculty_mail});
})

app.post("/query",(req,res)=>{
  if (req.session.userData) {
    const fmail = req.body.fmail;
    const uniqueId = uuidv4();
    db.collection('Users').doc(req.session.userData.Department).collection(req.session.userData.Department).doc("Student").collection("Student").doc(req.session.userData.Useremail).collection("doubts").doc(uniqueId).set({
      id: uniqueId,
      name:req.session.userData.Useremail,
      subject:req.body.sub,
      description:req.body.description,
    })
    db.collection('Users').doc(req.session.userData.Department).collection(req.session.userData.Department).doc("Faculty").collection("Faculty").doc(fmail).collection("doubts").doc(uniqueId).set({
      id:uniqueId,
      name:req.session.userData.Useremail,
      subject:req.body.sub,
      description:req.body.description,
    })
    res.send(` 
    <html> 
    <head> 
      <script src="https://unpkg.com/sweetalert/dist/sweetalert.min.js"></script> 
    </head> 
    <body> 
      <script> 
        swal({ 
          title: "Success!", 
          text: "Request sent successfully.", 
          icon: "success", 
          button: "OK" 
        })
      </script> 
    </body> 
    </html> 
  `);
  } else {
    res.send('<script>alert("Please Login."); window.location.href = "/login";</script>');
  }
});

app.post("/Editqueryreply",(req,res)=>{
  if (req.session.userData){
    const department = req.session.userData.Department;
    db.collection('Users').doc(department).collection(department).doc("Student").collection("Student").doc(req.body.name).collection("replies").doc(req.body.id).update({
      response:req.body.response
    });
    db.collection('Users').doc(department).collection(department).doc("Faculty").collection("Faculty").doc(req.session.userData.Useremail).collection("replies").doc(req.body.id).update({
      response:req.body.response,
    })       
    res.redirect("/replies");
  } else {
    res.redirect("/login")
  }
});

app.get("/facultyreplies",(req,res)=>{
  if (req.session.userData){
  const replies=[];
  const department = req.session.userData.Department;
  db.collection('Users').doc(department).collection(department).doc("Student").collection("Student").doc(req.session.userData.Useremail).collection("replies").get().then((docs)=>{
    if(docs.size>0){
        docs.forEach((doc)=>{
            replies.push({
              name:doc.data().name,
              sub:doc.data().subject,
              description:doc.data().description,
              response:doc.data().response,
              replyfrom:doc.data().replyfrom,
            })
        })
      }
      res.render("facultyreplies.ejs",{
        names:replies,
      });
    });
  } else {
    res.redirect('/login');
  }
});


app.post('/reset-password', async (req,res) => {
  const userEmail = req.session.credentials.user_email;
  const department = req.session.credentials.user_dept;
  const Role = req.session.credentials.user_role;
  const newPassword = req.body.Pass;
  const verificationCode = req.body.Code1 + req.body.Code2 + req.body.Code3 + req.body.Code4 + req.body.Code5 + req.body.Code6;
  const originalCode = req.body.original_code;
  const userRef = await db.collection('Users').doc(department).collection(department).doc(Role).collection(Role).doc(userEmail);
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
  ECE: 'muralik12@vishnu.edu.in',
  Civil: 'shankardev75@gmail.com',
  EEE: 'srinivasarao12@vishnu.edu.in',
  Mech: 'krravi13@vishnu.edu.in'
};

app.post('/request-form-data-upload', upload.single('documents'), async (req, res) => {
  if (req.session.userData) {
    const studentEmail = req.session.userData.Useremail;
    const department = req.session.userData.Department;
    const Role = req.session.userData.Role;
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
    const userDocument = await db.collection('Users').doc(department).collection(department).doc('Student').collection('Student').doc(studentEmail);
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
      const hodDocumentRef = db.collection('Users').doc(department).collection(department).doc('HOD').collection('HOD').doc(hodEmail);
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
    const Role = req.session.userData.Role;
    // Retrieve the student's requests from the database
    const studentRequestsRef = db.collection('Users').doc(department).collection(department).doc(Role).collection(Role).doc(studentEmail).collection('requests');
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
    const requestsRef = db.collection('Users').doc(department).collection(department).doc("HOD").collection("HOD").doc(hodmail).collection('requests');
    
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
    const requestsRef = db.collection('Users').doc(department).collection(department).doc("HOD").collection("HOD").doc(hodmail).collection('requests');
    const requestDoc = requestsRef.doc(requestId);
    const studentEmail = req.body.regd_no.toLowerCase()+"@vishnu.edu.in";
    const StudentrequestsRef = db.collection('Users').doc(department).collection(department).doc("Student").collection("Student").doc(studentEmail).collection('requests');
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

app.post("/delete",(req,res)=>{
  if (req.session.userData){
    const department = req.session.userData.Department;
    db.collection('Users').doc(department).collection(department).doc("Student").collection("Student").doc(req.body.name).collection("doubts").doc(req.body.id).delete();
    db.collection('Users').doc(department).collection(department).doc("Faculty").collection("Faculty").doc(req.session.userData.Useremail).collection("doubts").doc(req.body.id).delete();
    res.redirect("/facultymembers");
  } else {
    res.send('<script>alert("Please Login."); window.location.href = "/login";</script>');
  }
});

app.post("/Editdelete",(req,res)=>{
  if (req.session.userData){
    const department = req.session.userData.Department;
    db.collection('Users').doc(department).collection(department).doc("Student").collection("Student").doc(req.body.name).collection("replies").doc(req.body.id).delete();
    db.collection('Users').doc(department).collection(department).doc("Faculty").collection("Faculty").doc(req.session.userData.Useremail).collection("replies").doc(req.body.id).delete();
    res.redirect("/replies");
  } else{
    res.send('<script>alert("Please Login."); window.location.href = "/login";</script>');
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