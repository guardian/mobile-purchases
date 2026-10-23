
### Directive 1: Code Organization

The code layout is kept purposely simple. The lambdas, and notably the handlers, are kept in the `./lambdas` directory and all common code is kept in `./common`.

"Common code" is defined as something that is used in more than one lambda. Otherwise each lambda is responsible to keep its own resources and adjacent code localised with the handler.
