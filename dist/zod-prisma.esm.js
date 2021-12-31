import path from 'path';
import { generatorHandler } from '@prisma/generator-helper';
import { Project, StructureKind, VariableDeclarationKind } from 'ts-morph';
import { SemicolonPreference } from 'typescript';
import z from 'zod';

var getJSDocs = function getJSDocs(docString) {
  var lines = [];

  if (docString) {
    var docLines = docString.split('\n').filter(function (dL) {
      return !dL.trimLeft().startsWith('@zod');
    });

    if (docLines.length) {
      lines.push('/**');
      docLines.forEach(function (dL) {
        return lines.push(" * " + dL);
      });
      lines.push(' */');
    }
  }

  return lines;
};
var computeModifiers = function computeModifiers(docString) {
  return docString.split('\n').filter(function (line) {
    return line.trimLeft().startsWith('@zod');
  }).map(function (line) {
    return line.trim().split('@zod.').slice(-1)[0];
  });
};

var getZodConstructor = function getZodConstructor(field, getRelatedModelName) {
  if (getRelatedModelName === void 0) {
    getRelatedModelName = function getRelatedModelName(name) {
      return name.toString();
    };
  }

  var zodType = 'z.unknown()';
  var extraModifiers = [''];

  if (field.kind === 'scalar') {
    switch (field.type) {
      case 'String':
        zodType = 'z.string()';
        break;

      case 'Int':
        zodType = 'z.number()';
        extraModifiers.push('int()');
        break;

      case 'BigInt':
        zodType = 'z.bigint()';
        break;

      case 'DateTime':
        zodType = 'z.date()';
        break;

      case 'Float':
        zodType = 'z.number()';
        break;

      case 'Decimal':
        zodType = 'z.number()';
        break;

      case 'Json':
        zodType = 'z.any()';
        break;

      case 'Boolean':
        zodType = 'z.boolean()';
        break;

      case 'Bytes':
        zodType = 'z.unknown()';
        break;
    }
  } else if (field.kind === 'enum') {
    zodType = "z.nativeEnum(" + field.type + ")";
  } else if (field.kind === 'object') {
    zodType = getRelatedModelName(field.type);
  }

  if (field.isList) extraModifiers.push('array()');

  if (field.documentation) {
    extraModifiers.push.apply(extraModifiers, computeModifiers(field.documentation));
  }

  if (!field.isRequired) extraModifiers.push('nullable()');
  return "" + zodType + extraModifiers.join('.');
};

var writeArray = function writeArray(writer, array, newLine) {
  if (newLine === void 0) {
    newLine = true;
  }

  return array.forEach(function (line) {
    return writer.write(line).conditionalNewLine(newLine);
  });
};

var configSchema = /*#__PURE__*/z.object({
  relationModel: /*#__PURE__*/z["enum"](['default', 'true', 'false'])["default"]('true').transform(function (val) {
    switch (val) {
      case 'default':
        return val;

      case 'true':
        return true;

      case 'false':
        return false;
    }
  }),
  modelSuffix: /*#__PURE__*/z.string()["default"]('Model'),
  modelCase: /*#__PURE__*/z["enum"](['PascalCase', 'camelCase'])["default"]('PascalCase')
});
generatorHandler({
  onManifest: function onManifest() {
    return {
      prettyName: 'Zod Schemas',
      defaultOutput: 'zod',
      version: '0.2.1'
    };
  },
  onGenerate: function onGenerate(options) {
    var project = new Project({
      skipAddingFilesFromTsConfig: true
    });
    var outputPath = options.generator.output.value;
    var models = options.dmmf.datamodel.models;
    var prismaClient = options.otherGenerators.find(function (each) {
      return each.provider.value === 'prisma-client-js';
    });
    var parsedConfig = configSchema.safeParse(options.generator.config);
    if (!parsedConfig.success) throw new Error('Incorrect config provided. Please check the values you provided and try again.');
    var _parsedConfig$data = parsedConfig.data,
        relationModel = _parsedConfig$data.relationModel,
        modelSuffix = _parsedConfig$data.modelSuffix,
        modelCase = _parsedConfig$data.modelCase;

    var formatModelName = function formatModelName(name, prefix) {
      if (prefix === void 0) {
        prefix = '';
      }

      if (modelCase === 'camelCase') {
        name = name.slice(0, 1).toLowerCase() + name.slice(1);
      }

      return "" + prefix + name + modelSuffix;
    };

    var indexSource = project.createSourceFile(outputPath + "/index.ts", {}, {
      overwrite: true
    });
    models.forEach(function (model) {
      indexSource.addExportDeclaration({
        moduleSpecifier: "./" + model.name.toLowerCase()
      });

      var modelName = function modelName(name) {
        return formatModelName(name, relationModel === 'default' ? '_' : '');
      };

      var relatedModelName = function relatedModelName(name) {
        return formatModelName(relationModel === 'default' ? name.toString() : "Related" + name.toString());
      };

      var sourceFile = project.createSourceFile(outputPath + "/" + model.name.toLowerCase() + ".ts", {
        statements: [{
          kind: StructureKind.ImportDeclaration,
          namespaceImport: 'z',
          moduleSpecifier: 'zod'
        }]
      }, {
        overwrite: true
      });
      var enumFields = model.fields.filter(function (f) {
        return f.kind === 'enum';
      });
      var relativePath = path.relative(outputPath, prismaClient.output.value);

      if (relativePath.endsWith('/node_modules/@prisma/client')) {
        relativePath = '@prisma/client';
      } else if (!relativePath.startsWith('./') && !relativePath.startsWith('../')) {
        relativePath = "./" + relativePath;
      }

      var relationFields = model.fields.filter(function (f) {
        return f.kind === 'object';
      });

      if (relationModel !== false && relationFields.length > 0 || enumFields.length > 0) {
        sourceFile.addImportDeclaration({
          kind: StructureKind.ImportDeclaration,
          isTypeOnly: enumFields.length === 0,
          moduleSpecifier: relativePath,
          namedImports: relationModel !== false && relationFields.length > 0 ? [model.name].concat(enumFields.map(function (f) {
            return f.type;
          })) : enumFields.map(function (f) {
            return f.type;
          })
        });
      }

      sourceFile.addStatements(function (writer) {
        return writeArray(writer, getJSDocs(model.documentation));
      });
      sourceFile.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        isExported: true,
        declarations: [{
          name: modelName(model.name),
          initializer: function initializer(writer) {
            writer.write('z.object(').inlineBlock(function () {
              model.fields.filter(function (f) {
                return f.kind !== 'object';
              }).forEach(function (field) {
                writeArray(writer, getJSDocs(field.documentation));
                writer.write(field.name + ": " + getZodConstructor(field)).write(',').newLine();
              });
            }).write(')');
          }
        }]
      });

      if (relationModel !== false && relationFields.length > 0) {
        var filteredFields = relationFields.filter(function (f) {
          return f.type !== model.name;
        });

        if (filteredFields.length > 0) {
          sourceFile.addImportDeclaration({
            kind: StructureKind.ImportDeclaration,
            moduleSpecifier: './index',
            namedImports: Array.from(new Set(filteredFields.flatMap(function (f) {
              return ["Complete" + f.type, relatedModelName(f.type)];
            })))
          });
        }

        sourceFile.addInterface({
          name: "Complete" + model.name,
          isExported: true,
          "extends": function _extends(writer) {
            return writer.write(model.name);
          },
          properties: relationFields.map(function (f) {
            return {
              name: f.name,
              type: "Complete" + f.type + (f.isList ? '[]' : '') + (!f.isRequired ? ' | null' : '')
            };
          })
        });
        sourceFile.addStatements(function (writer) {
          return writeArray(writer, ['', '/**', " * " + relatedModelName(model.name) + " contains all relations on your model in addition to the scalars", ' *', ' * NOTE: Lazy required in case of potential circular dependencies within schema', ' */']);
        });
        sourceFile.addVariableStatement({
          declarationKind: VariableDeclarationKind.Const,
          isExported: true,
          declarations: [{
            name: relatedModelName(model.name),
            type: "z.ZodSchema<Complete" + model.name + ">",
            initializer: function initializer(writer) {
              writer.write("z.lazy(() => " + modelName(model.name) + ".extend(").inlineBlock(function () {
                relationFields.forEach(function (field) {
                  writeArray(writer, getJSDocs(field.documentation));
                  writer.write(field.name + ": " + getZodConstructor(field, relatedModelName)).write(',').newLine();
                });
              }).write('))');
            }
          }]
        });
      }

      sourceFile.formatText({
        indentSize: 2,
        convertTabsToSpaces: true,
        semicolons: SemicolonPreference.Remove
      });
    });
    return project.save();
  }
});
//# sourceMappingURL=zod-prisma.esm.js.map
