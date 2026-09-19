const cheerio = require('cheerio');
function htmlToText(html) {
    const $ = cheerio.load(html);
    $('script, style, iframe, noscript, svg, nav, footer, header').remove();
    $('br').replaceWith('\n');
    $('p, div, h1, h2, h3, h4, h5, h6').each(function() { $(this).append('\n\n'); });
    $('li').each(function() { $(this).prepend('• ').append('\n'); });
    let text = $.text();
    text = text.replace(/[ \t]+/g, ' '); // collapse inline spaces
    text = text.replace(/ \n /g, '\n');
    text = text.replace(/\n{3,}/g, '\n\n'); // collapse multiple newlines
    return text.trim();
}

const sampleHtml = `
You will work in a start-up like environment, backed by Amazon’s infrastructure to bootstrap security mechanisms, and help instill the security culture in the organization.<br/><br/>Export Control Requirement<br/>Due to applicable export control laws
`;

console.log(htmlToText(sampleHtml));
