const SolExplore = require('sol-explore');
const SolidityParser = require('solidity-parser-sc');

const crRegex = /[\r\n ]+$/g;
/**
 * Splices enclosing brackets into `contract` around `expression`;
 * @param  {String} contract solidity source
 * @param  {Object} node     AST node to bracket
 * @return {String}          contract
 */
function blockWrap(contract, expression, offset) {
  return contract.slice(0, expression.start + offset) + '{' + contract.slice(expression.start + offset, expression.end + offset) + '}' + contract.slice(expression.end + offset);
}


/**
 * Captures carriage returns at modifiers we'll remove. These need to be re-injected into the
 * source to keep line report alignments accurate.
 * @param  {String} contract solidity source
 * @param  {Object} modifier AST node
 * @return {String} whitespace around the modifier
 */
function getModifierWhitespace(contract, modifier) {
  const source = contract.slice(modifier.start, modifier.end);
  const whitespace = source.match(crRegex) || [];
  const space = whitespace.join('');
  return ' '.repeat(modifier.end - modifier.start - space.length) + space;
}

/**
 * Locates unbracketed singleton statements attached to if, else, for and while statements
 * and brackets them. Instrumenter needs to inject events at these locations and having
 * them pre-bracketed simplifies the process. Each time a modification is made the contract
 * is passed back to the parser and re-walked because all the starts and ends get shifted.
 *
 * Also removes pure and view modifiers.
 *
 * @param  {String} contract solidity code
 * @return {String}          contract
 */
module.exports.run = function r(contract) {
  let offset = 0;
  try {
    const ast = SolidityParser.parse(contract);
    SolExplore.traverse(ast, {
      leave(node, parent) {
        if (node.wrap) {
          offset += 1;
        }
      },

      enter(node, parent) { // eslint-disable-line no-loop-func
        // If consequents
        if (node.type === 'IfStatement' && node.consequent.type !== 'BlockStatement') {
          contract = blockWrap(contract, node.consequent, offset);
          offset += 1;
          node.wrap = true;
        // If alternates
        } else if (
            node.type === 'IfStatement' &&
            node.alternate &&
            node.alternate.type !== 'BlockStatement') {
          contract = blockWrap(contract, node.alternate, offset);
          offset += 1;
          node.wrap = true;
        // Loops
        } else if (
            (node.type === 'ForStatement' || node.type === 'WhileStatement') &&
            node.body.type !== 'BlockStatement') {
          contract = blockWrap(contract, node.body, offset);
          offset += 1;
          node.wrap = true;
        }
      },
    });
  } catch (err) {
    contract = err;
  }

  const ast = SolidityParser.parse(contract);
  SolExplore.traverse(ast, {
    enter(node, parent) {
      if (node.type === 'FunctionDeclaration' && node.modifiers) {
        // We want to remove constant / pure / view from functions
        for (let i = 0; i < node.modifiers.length; i++) {
          if (['pure', 'constant', 'view'].indexOf(node.modifiers[i].name) > -1) {
            const whitespace = getModifierWhitespace(contract, node.modifiers[i]);

            contract = contract.slice(0, node.modifiers[i].start) +
                      whitespace +
                      contract.slice(node.modifiers[i].end);
          }
        }
      }
    },
  });

  return contract;
};
