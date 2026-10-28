mpapi-next-gen is a new project inside the legacy mpapi repository. The aim is to migrate the existing lambdas to this updated framework one by one. Starting with a lambda that is going to replace the existing scala code. In this first version we are just testing the build and the deployment.

### Local development

package manager: yarn

linting and formatting

```
yarn lint:check
yarn lint:fix
yarn format:check
yarn format:fix

yarn validate
```

If you are not familiar with them please refer to [scr/code-directives.md](scr/code-directives.md)

### @googleapis/androidpublisher

Note that we had had problems with @googleapis/androidpublisher which for the moment needs to remain at version 27.0.0

### Adding a new lamdda

1. Add a new .ts file in `scr/handlers`
2. Add a new entry in `esbuild.config.js`
3. Add a new entry in `build.sh`
4. Update the "Upload to Riff-Raff" of ci.yaml to point at the right bundle
5. If needed update the architecture diagram

In the specific case of the on going lambda migrations, you will also need to 

1. Remove the entry in the legacy webpack config file
2. Remove the old handler in the legacy code

### System documentation

see [./docs](./docs/README.md)
