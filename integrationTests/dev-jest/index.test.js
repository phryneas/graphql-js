/* eslint-disable no-undef */
import { isObjectType } from 'graphql';

class FakeGraphQLObjectType {
  get [Symbol.toStringTag]() {
    return 'GraphQLObjectType';
  }
}

describe('Jest with SWC development mode tests', () => {
  test('isObjectType should throw in development mode for instances from another realm/module', () => {
    expect(() => isObjectType(new FakeGraphQLObjectType())).toThrowError(
      /from another module or realm/,
    );
  });
});
