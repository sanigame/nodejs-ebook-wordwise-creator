const fs = require('fs');
const { execSync } = require('child_process');

function deleteDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        throw new Error(`${dirPath} does not exist.`);
    }

    const files = fs.readdirSync(dirPath);
    for (const file of files) {
        const filePath = `${dirPath}/${file}`;
        if (fs.statSync(filePath).isDirectory()) {
            deleteDir(filePath);
        } else {
            fs.unlinkSync(filePath);
        }
    }

    fs.rmdirSync(dirPath);
}

function cleanWord(word) {
    word = word.replace(/<\/?[^>]+(>|$)/g, ''); // strip HTML tags

    // const specialChars = [',', '<', '>', ';', '&', '*', '~', '/', '"', '[', ']', '#', '?', '`', '–', '.', "'", '"', '"', '!', '“', '”', ':', '.'];
    const specialChars = [',', '<', '>', ';', '&'];

    for (const char of specialChars) {
      word = word.replace(new RegExp(char, 'g'), ''); // strip special chars
    }

    word = word.replace(/[^ \w]+/g, ''); // strip non-word and non-space characters
    // word = word.toLowerCase(); // lowercase URL

    return word;
}

const bookfile = process.argv[2];
const bookpath = require('path').dirname(bookfile);
const bookfilename = require('path').basename(bookfile, require('path').extname(bookfile));
const lang = process.argv[3] || 'en';
const hint_level = process.argv[4] || 5;

if (!process.argv[2]) {
    console.log(`usage: ${process.argv[1]} input_file hint_level`);
    console.log("input_file : path to file need to generate wordwise ");
    console.log("hint_level : from 1 to 5 default is 5, 1 is less wordwise hint show - only hard word will have definition, 5 is all wordwise hints show");
    process.exit(1);
}

console.log(`[+] Hint level: ${hint_level}`);

// Load Stop Words
console.log("[+] Load Stop Words");
const stopwords = fs.readFileSync('./stopwords.txt', 'utf8').split('\n').filter(Boolean);

// Load Dict from CSV
console.log("[+] Load Wordwise Dict");
const csvData = fs.readFileSync('wordwise-dict.csv', 'utf8');
const lines = csvData.split('\n');
const headers = lines.shift().split(',');
const wordwise_dict = lines.map(line => {
    const row = line.split(',').reduce((acc, val, index) => {
        acc[headers[index]] = val.trim();
        return acc;
    }, {});
    return row;
});

// Clean temp
console.log("[+] Clean old temps");
if (fs.existsSync('book_dump.htmlz')) {
    fs.unlinkSync('book_dump.htmlz');
}
deleteDir('book_dump_html');

// Convert Book to HTML
console.log("[+] Convert Book to HTML");
execSync(`ebook-convert "${bookfile}" ./book_dump.htmlz`);
execSync(`ebook-convert ./book_dump.htmlz ./book_dump_html`);

if (!fs.existsSync('book_dump_html/index1.html')) {
    console.log('Please check if you have Calibre installed and can run the "ebook-convert" command.');
    process.exit(1);
}

// Get content
console.log("[+] Load Book Contents");
const bookcontent = fs.readFileSync('book_dump_html/index1.html', 'utf8');
const bookcontent_arr = bookcontent.split(" ");

// Process Word
console.log(`[+] Process (${bookcontent_arr.length}) Words`);
// sleep(5000); // sleep is not available in JavaScript

for (let i = 0; i <= bookcontent_arr.length; i++) {
    if (bookcontent_arr[i] && bookcontent_arr[i] !== '') {
        const word = cleanWord(bookcontent_arr[i]);

        // Check if stopword
        if (stopwords.includes(word)) {
            continue; // SKIP
        }

        // Search Word in Wordwise Dict
        const key_found = wordwise_dict.findIndex(item => item.word.toLowerCase() === word.toLowerCase());
        if (key_found !== -1) {
            const wordwise = wordwise_dict[key_found];

            // Check hint_level of current matched word
            if (wordwise.hint_level > hint_level) continue; // SKIP all higher hint_level word

            console.log(`[>>] Processing Word: ${i}`);
            console.log(`[#] bookcontent_arr[${i}]: ${bookcontent_arr[i]}`);

            let wordwiseLang = lang
            if(wordwiseLang === 'en') {
              wordwiseLang = 'short_def'
            }
            console.log('wordwiseLang', wordwiseLang)

            // Replace Original Word with Wordwised
            bookcontent_arr[i] = bookcontent_arr[i].replace(
                new RegExp(`(${word})`, 'i'),
                `<ruby style="line-height: 3;">$1<rt>${wordwise[wordwiseLang]}</rt></ruby>`
            );

            console.log(`[#] word: ${word}`);
            console.log(`[#] bookcontent_arr REPLACED: ${bookcontent_arr[i]}`);
            console.log(`progress ${i}/${bookcontent_arr.length} => ${i/bookcontent_arr.length*100} %`)
        }
    }
}

// Create new book with Wordwised
console.log("[+] Create New Book with Wordwised");
const new_bookcontent_with_wordwised = bookcontent_arr.join(' ');
fs.writeFileSync('book_dump_html/index1.html', new_bookcontent_with_wordwised);
execSync(`ebook-convert ./book_dump_html/index1.html "${bookpath}/${bookfilename}-wordwised.epub"`);
// execSync(`ebook-convert ./book_dump_html/index1.html "${bookpath}/${bookfilename}-wordwised.azw3"`);
// execSync(`ebook-convert ./book_dump_html/index1.html "${bookpath}/${bookfilename}-wordwised.pdf"`);

console.log("[+] 3 book EPUB, AZW3, PDF with wordwise generated Done!");

// node index.js Kindle_Word_Wise_test-Doitsu.mobi en 5
