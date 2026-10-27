const { withProjectBuildGradle } = require('expo/config-plugins');

// Configure Ninja pools through CNG, never by hand editing generated native files.
module.exports = function withBuildLimits(config) {
  return withProjectBuildGradle(config, mod => {
    const marker = '// ShopFit native build memory limits';
    const original = mod.modResults.contents
      .replace(/\n\/\/ ShopFit native build memory limits[\s\S]*?\/\/ End ShopFit native build memory limits\n?/, '\n')
      .replace(/\n\/\/ ShopFit native build memory limits[\s\S]*?(?=\napply plugin: "expo-root-project"|$)/, '');
    const block = `
${marker}
subprojects { subproject ->
  subproject.afterEvaluate {
    if (subproject.plugins.hasPlugin('com.android.application') || subproject.plugins.hasPlugin('com.android.library')) {
      subproject.android.defaultConfig.externalNativeBuild.cmake.arguments.addAll([
        '-DCMAKE_JOB_POOLS=shopfit_compile=2;shopfit_link=1',
        '-DCMAKE_JOB_POOL_COMPILE=shopfit_compile',
        '-DCMAKE_JOB_POOL_LINK=shopfit_link'
      ])
    }
  }
}
// End ShopFit native build memory limits
`;
    // The React root plugin eagerly evaluates native modules; register callbacks before it runs.
    const anchor = 'apply plugin: "expo-root-project"';
    if (!original.includes(anchor)) throw new Error('Unsupported Android template: root plugin anchor missing');
    mod.modResults.contents = original.replace(anchor, block + '\n' + anchor);
    return mod;
  });
};
