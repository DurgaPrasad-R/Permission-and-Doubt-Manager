const change = () =>{
    const sam = document.getElementById("sample");
    sam.hidden=true;
}
const call = document.getElementsByClassName("call");
for( let i = 0 ;i<call.length;i++){
    call[i].addEventListener('click',change);
}
const home = document.getElementsByClassName("fa-solid");