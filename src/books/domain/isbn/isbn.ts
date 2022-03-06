import { IsbnFormatException } from '../../../shared/isbn/isbn-format.exception';
import { IsbnFormatFactory } from '../../../shared/isbn/isbn-format.factory';
import axios from 'axios';

export class Isbn {
  private readonly _value: string;
  private readonly version: number = +process.env.ISBN_VERSION || 13;

  constructor(isbn: string) {
    const isbnFormat: RegExp = IsbnFormatFactory.get(this.version);
    const found = String(isbn).match(isbnFormat);
    if (!found) {
      throw new IsbnFormatException(
        `ISBN-${this.version} format is: 'aaa-b-cc-dddddd-e' (with or without dashes). Error with '${isbn}'`,
      );
    }
    this._value = found.slice(1).join('');
  }

  async verify(): Promise<boolean> {
    const res = await axios.get(
      'https://www.googleapis.com/books/v1/volumes?q=isbn:' + this.value,
    );
    return res.data.totalItems === 0 ? false : true;
  }

  get value(): string {
    return this._value;
  }
}
