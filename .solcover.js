const skipFiles = ['test', 'interfaces']

module.exports = {
  providerOptions: {
    mnemonic: '',
    network_id: 1337,
  },
  skipFiles,
  istanbulFolder: './reports/coverage',
}
