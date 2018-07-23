var a = document.createElement('a');
document.body.appendChild(a);
a.style.display = 'none';

export function saveAs(arr, fileName) {
    const blob = new Blob([arr], {type: 'octet/stream'});
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(url);
}