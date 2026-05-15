const fs = require('fs');
let content = fs.readFileSync('public/kjv-formatted.json', 'utf8');
const lastValidStringIdx = content.lastIndexOf('{\"v\":');
if (lastValidStringIdx !== -1) {
    let fix = content.substring(0, lastValidStringIdx);
    if (fix.endsWith(',')) fix = fix.substring(0, fix.length - 1);
    fix += ']}]}]}'; // close verses array, chapter object, chapters array, book object, books array, root object
    
    try {
        JSON.parse(fix);
        fs.writeFileSync('public/kjv-formatted.json', fix);
        console.log('Fixed JSON successfully.');
    } catch (e) {
        console.log('Failed to parse fixed JSON:', e.message);
        
        // Let's try again with a simpler cut
        let b = content.substring(0, lastValidStringIdx);
        // find last complete verse
        const lastC = b.lastIndexOf('}');
        if (lastC !== -1) {
            let b2 = b.substring(0, lastC + 1);
            b2 += ']}]}]}';
            try {
                JSON.parse(b2);
                fs.writeFileSync('public/kjv-formatted.json', b2);
                console.log('Fixed JSON on second try.');
            } catch (err) {
               console.log('Still failed:', err.message);
            }
        }
    }
}
