var gulp = require('gulp');
var uglify = require('gulp-uglify');
var jshint = require('gulp-jshint');
 
gulp.task('compress', function() {
  gulp.src('public/scripts/views/*.js')
    .pipe(uglify())
    .pipe(gulp.dest('public/scripts/views-compressed/'));
});

gulp.task('jshint', function(){
    return gulp.src([
            'public/scripts/views/**/*.js',
            'index.js',
            'i18n.js'
        ])
        .pipe(jshint('.jshintrc'))
        .pipe(jshint.reporter('jshint-stylish'));
        
});