# this script here after the removal of gulp
# previously in gulp we have rule that checks that we dont have .only in tests
# gulp was responsible only for the files that are managed jshint linter
# as in eslint linter we have predefined rule for it
# one jshint is removed from api this file can be removed as well

echo "Testing all test file to ensure no it.only is leftover"
./node_modules/.bin/eslint --no-ignore -c eslint.test.json .