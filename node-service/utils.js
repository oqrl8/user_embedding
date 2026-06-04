function generateEmbedding(text) {
  return text
    .trim()
    .split(' ')
    .map((word) => word.length)
    .slice(0, 32);
}

module.exports = {
  generateEmbedding,
};
