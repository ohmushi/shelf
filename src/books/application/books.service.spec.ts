import { Test, TestingModule } from '@nestjs/testing';
import { BooksService } from './books.service';
import { BookRepositoryTypeORM } from '../persistence/book.repository.typeORM';
import { Book } from '../domain/book';
import { Isbn } from '../domain/isbn/isbn';
import { AddBookDto } from '../dto/add-book.dto';
import { IsbnFormatException } from '../../shared/isbn/isbn-format.exception';
import { BufferFile } from '../../shared/files/buffer-file';
import { BookCover } from '../domain/book-cover';
import { BookCoverFileSystemRepository } from '../persistence/book-cover.file-system.repository';
import { FilesUtils } from '../../shared/files/files.utils';
import { FileLocation } from '../../shared/files/file-location';
import { BookNotFoundException } from './exceptions/book.not-found.exception';
import { BookCoverMinioRepository } from '../persistence/book-cover.minio.repository';
import { LibraryRepositoryShelfApi } from '../persistence/library.repository.shelf-api';
import { UpdateBookDto } from '../dto/update-book.dto';
import { IsbnValidatorGoogleApi } from '../../shared/isbn/isbn.validator.google-api';

describe('BooksService', () => {
  let service: BooksService;
  const mockBooks: Map<string, Book> = new Map([
    [
      '1234567890001',
      Book.builder()
        .isbn('1234567890001')
        .title('title 1')
        .author('author 1')
        .overview('overview 1')
        .readCount(1)
        .cover(Buffer.alloc(10), 'path1')
        .build(),
    ],
    [
      '1234567890002',
      Book.builder()
        .isbn('1234567890002')
        .title('title 2')
        .author('author 2')
        .overview('overview 2')
        .readCount(2)
        .cover(Buffer.alloc(10), 'path2')
        .build(),
    ],
  ]);
  const mockFileStorage = new Set<string>();
  const mockBooksRepositoryImp = {
    find: jest.fn().mockResolvedValue(Array.from(mockBooks.values())),
    save: jest.fn((book: Book) => {
      mockBooks.set(book.isbn.value, book);
      mockFileStorage.add(book.cover.location.path);
    }),
    delete: jest.fn((isbn: Isbn) => {
      mockBooks.delete(isbn.value);
    }),
    findOne: jest.fn((isbn: Isbn) => mockBooks.get(isbn.value)),
    exists: jest
      .fn()
      .mockImplementation((isbn: Isbn) => mockBooks.has(isbn.value)),
    remove: jest
      .fn()
      .mockImplementation((isbn: Isbn) => mockBooks.delete(isbn.value)),
    findCoverLocation: jest.fn().mockImplementation((isbn: Isbn) => {
      if (!mockBooks.has(isbn.value)) throw new BookNotFoundException(isbn);
      mockBooks.get(isbn.value).cover.location;
    }),
  };

  const mockBookCoverRepository = {
    save: jest.fn((bookCover: BookCover) => {
      const name = FilesUtils.fileNameOfPath(bookCover.location.path);
      mockFileStorage.add(name);
      return name;
    }),
    delete: jest.fn().mockImplementation((location: FileLocation) => {
      if (location) {
        mockFileStorage.delete(location.path);
      }
    }),
  };

  const mockLibraryStorage = new Map<string, Set<string>>();
  const mockLibraryRepositoryShelfApi = {
    removeBookFromAllLibraries: jest.fn().mockImplementation((isbn: Isbn) => {
      mockLibraryStorage.forEach((library) => library.delete(isbn.value));
    }),
  };

  const mockIsbnValidator = {
    validate: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BooksService,
        BookRepositoryTypeORM,
        BookCoverFileSystemRepository,
        BookCoverMinioRepository,
        LibraryRepositoryShelfApi,
        IsbnValidatorGoogleApi,
      ],
    })
      .overrideProvider(BookRepositoryTypeORM)
      .useValue(mockBooksRepositoryImp)
      .overrideProvider(BookCoverFileSystemRepository)
      .useValue(mockBookCoverRepository)
      .overrideProvider(BookCoverMinioRepository)
      .useValue(mockBookCoverRepository)
      .overrideProvider(LibraryRepositoryShelfApi)
      .useValue(mockLibraryRepositoryShelfApi)
      .overrideProvider(IsbnValidatorGoogleApi)
      .useValue(mockIsbnValidator)
      .compile();

    service = module.get<BooksService>(BooksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should get all the books', async () => {
    const allBooks: Book[] = await service.findAll();
    expect(allBooks).toEqual(Array.from(mockBooks.values()));
  });

  it('should add a book', async () => {
    const book: AddBookDto = {
      isbn: '9782070360024',
      title: "L'Étranger",
      author: 'Albert Camus',
      overview: 'overview',
      read_count: 1,
    };
    await service.add(book, {
      buffer: Buffer.alloc(10),
      originalname: '9782070360024.jpg',
    } as BufferFile);
    expect(mockBooksRepositoryImp.save).toHaveBeenCalled();
  });

  it('should update a book', async () => {
    const book: UpdateBookDto = {
      title: 'new title',
    };

    const isbn = '1234567890001';

    await service.update(isbn, book, null);
    expect(mockBooksRepositoryImp.findOne).toHaveBeenCalled();
    expect(mockBooksRepositoryImp.save).toHaveBeenCalled();

    expect(mockBooks.get('1234567890001').title.value).toEqual('new title');
  });

  it('should throw an IsbnFormatException', async () => {
    const book = {
      title: "L'Étranger",
      author: 'Albert Camus',
      overview: 'overview',
      read_count: 1,
    };
    await expect(() =>
      service.add({ isbn: 'BadIsbn', ...book }, null),
    ).rejects.toThrow(IsbnFormatException);
    await expect(() =>
      service.add({ isbn: 'BadIsbn', ...book }, null),
    ).rejects.toThrow(
      "ISBN-13 format is: 'aaa-b-cc-dddddd-e' (with or without dashes)",
    );
  });

  it('should found a book by its isbn', async function () {
    expect(await service.findOne('1234567890001')).toEqual(
      mockBooks.get('1234567890001'),
    );
  });

  it('should delete a book', async function () {
    await service.remove('1234567890001');
    expect(mockBooks.has('1234567890001')).toBeFalsy();
  });

  it('should delete a book and remove it from all the librairies', async function () {
    mockLibraryStorage.set(
      'libraryId1',
      new Set<string>(['1234567890001', '1234567890002']),
    );
    mockLibraryStorage.set(
      'libraryId2',
      new Set<string>(['1234567890000', '1234567890002']),
    );
    await service.remove('1234567890002');
    expect(
      mockLibraryStorage.get('libraryId1').has('1234567890002'),
    ).toBeFalsy();
    expect(
      mockLibraryStorage.get('libraryId2').has('1234567890002'),
    ).toBeFalsy();
  });

  it('should not found isbn throw NotFoundException', async function () {
    await expect(() => service.remove('0000000000000')).rejects.toThrow(
      BookNotFoundException,
    );
  });

  it('should add a book with cover image', async () => {
    const book: AddBookDto = {
      isbn: '9782070360025',
      title: "L'Étranger",
      author: 'Albert Camus',
      overview: null,
      read_count: null,
    };
    const cover: BufferFile = {
      buffer: Buffer.alloc(10),
      encoding: '7bit',
      fieldname: 'cover_image',
      filename: '9782070360024.jpg',
      mimetype: 'image/jpeg',
      originalname: 'uploadExample.jpg',
      size: 1,
    };
    await service.add(book, cover);
    expect(mockFileStorage.has(cover.originalname)).toBeTruthy();
  });
});
