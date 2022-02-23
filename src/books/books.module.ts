import { Module } from '@nestjs/common';
import { BooksService } from './application/books.service';
import { BooksController } from './exposition/controller/books.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookEntity } from './persistence/book.entity';
import { BookRepositoryTypeORM } from './persistence/book.repository.typeORM';
import { BookCoverFileSystemRepository } from './persistence/book-cover.file-system.repository';

@Module({
  imports: [TypeOrmModule.forFeature([BookEntity])],
  controllers: [BooksController],
  providers: [
    BooksService,
    BookRepositoryTypeORM,
    BookCoverFileSystemRepository,
  ],
})
export class BooksModule {}
