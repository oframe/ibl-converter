export const DragDrop = {};

addHandlers();
function addHandlers() {
    document.addEventListener('dragenter', enter);
    document.addEventListener('dragover', over);
    document.addEventListener('dragleave', leave);
    document.addEventListener('drop', drop);
}

function enter(e) {
    e.preventDefault();
}

function over(e) {
    e.preventDefault();
}

function leave(e) {
    e.preventDefault();
}

function drop(e) {
    e.preventDefault();

    const file = e.dataTransfer.files[0];
    let split = file.name.split('.');
    const name = split[0];
    const ext = split[1].toLowerCase();

    const reader = new FileReader();

    reader.onload = function(e){
        const buffer = e.target.result;

        DragDrop.onDrop && DragDrop.onDrop(buffer, name, ext);
    };
    
    switch (ext) {
        case 'hdr' :   
            reader.readAsArrayBuffer(file);
            break;
        default :
            reader.readAsDataURL(file);
            break;
    }

}