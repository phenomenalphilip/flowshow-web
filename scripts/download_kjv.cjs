const fs = require('fs');

async function downloadAndTransform() {
    const res = await fetch('https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_kjv.json');
    const bibles = await res.json();
    
    const transformed = {
        id: "kjv",
        name: "King James Version",
        books: bibles.map(b => ({
            name: b.name,
            chapters: b.chapters.map((ch, chIdx) => ({
                c: chIdx + 1,
                verses: ch.map((v, vIdx) => ({
                    v: vIdx + 1,
                    text: v
                }))
            }))
        }))
    };
    
    fs.writeFileSync('public/kjv-formatted.json', JSON.stringify(transformed));
    console.log('Saved to public/kjv-formatted.json');
}

downloadAndTransform();
