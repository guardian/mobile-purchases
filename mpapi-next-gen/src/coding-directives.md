
### Directive 1: Code Organization

The code layout is kept purposely simple. The lambdas, and notably the handlers, are kept in the `./lambdas` directory and all common code is kept in `./common`.

"Common code" is defined as something that is used in more than one lambda. Otherwise each lambda is responsible to keep its own resources and adjacent code localised with the handler.

Test files should be colocated with the file they test.

### Directive 2: Imports

2.1 Lambdas' handlers in `./lambdas` can import from `./common`, but should not import from each other.

2.2 Files in `./common` can import from `./common`, but should not import from `./lambdas`.
